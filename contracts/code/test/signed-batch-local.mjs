// 仅连接独立本地 Hardhat 链，覆盖签名批量限价单的核心边界。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BrowserProvider, ContractFactory, parseEther } from "../../../apps/user/node_modules/ethers/lib.esm/index.js";

const rpc = "http://127.0.0.1:18545";
const provider = new BrowserProvider({
  request: async ({ method, params = [] }) => {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const result = await response.json();
    if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
    return result.result;
  },
});
// 防止测试脚本意外向其他网络发送交易。
const chainId = (await provider.getNetwork()).chainId;
const clientVersion = await provider.send("web3_clientVersion", []);
if (chainId !== 31337n || !String(clientVersion).toLowerCase().includes("hardhat"))
  throw new Error("仅允许连接本地 Hardhat 测试网络。");
const deployer = await provider.getSigner(0),
  alice = await provider.getSigner(1),
  bob = await provider.getSigner(2);
async function deploy(path, name, args = []) {
  const artifact = JSON.parse(await readFile(`artifacts/sources/${path}/${name}.json`, "utf8"));
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, deployer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}
const payment = await deploy("test/BatchOrderFixture.sol", "BatchTestPayment");
const factory = await deploy("test/BatchOrderFixture.sol", "BatchTestFactory");
const pair = await factory.getAddress();
await (await factory.setPair(pair)).wait();
const token = await deploy("test/BatchOrderFixture.sol", "BatchTestToken", [await payment.getAddress(), pair, pair]);
const router = await deploy("test/BatchOrderFixture.sol", "BatchTestRouter", [pair]);
const sale = await deploy("trading/TokenLimitOrders.sol", "TokenLimitOrders", [
  await token.getAddress(),
  await router.getAddress(),
]);
const amount = parseEther("100");
for (const signer of [alice, bob]) {
  await (await payment.mint(await signer.getAddress(), amount * 4n)).wait();
  await (await payment.connect(signer).approve(await sale.getAddress(), amount * 4n)).wait();
}
await (await token.mint(await router.getAddress(), amount * 10n)).wait();
const latest = await provider.getBlock("latest");
const domain = {
  name: "ChainForge Signed Limit Orders",
  version: "1",
  chainId: (await provider.getNetwork()).chainId,
  verifyingContract: await sale.getAddress(),
};
const types = {
  Order: [
    { name: "owner", type: "address" },
    { name: "buy", type: "bool" },
    { name: "amountIn", type: "uint256" },
    { name: "minOut", type: "uint256" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiry", type: "uint64" },
    { name: "salt", type: "uint256" },
  ],
};
const order = (owner, salt, minOut = amount) => ({
  owner,
  buy: true,
  amountIn: amount,
  minOut,
  issuedAt: latest.timestamp,
  expiry: latest.timestamp + 1800,
  salt,
});
const a = order(await alice.getAddress(), 1),
  b = order(await bob.getAddress(), 2);
const sa = await alice.signTypedData(domain, types, a),
  sb = await bob.signTypedData(domain, types, b);
await (await sale.executeBatch([a, b], [sa, sb])).wait();
assert.equal(await token.balanceOf(a.owner), amount);
assert.equal(await token.balanceOf(b.owner), amount);
await assert.rejects(sale.executeBatch.staticCall([a], [sa]));
const c = order(a.owner, 3),
  sc = await alice.signTypedData(domain, types, c);
await (await sale.connect(alice).cancelOrder(c)).wait();
await assert.rejects(sale.executeBatch.staticCall([c], [sc]));
const d = order(a.owner, 4),
  e = order(b.owner, 5, amount + 1n),
  sd = await alice.signTypedData(domain, types, d),
  se = await bob.signTypedData(domain, types, e);
await assert.rejects(sale.executeBatch.staticCall([d, e], [sd, se]));
assert.equal(await sale.consumed(await sale.orderHash(d)), false);
const bad = order(a.owner, 6);
bad.expiry += 1;
const sig = await alice.signTypedData(domain, types, bad);
await assert.rejects(sale.executeBatch.staticCall([bad], [sig]));
// ERC-1271 钱包订单也能验证并执行，且实际收款地址仍为合约钱包。
const smartWallet = await deploy("test/BatchOrderFixture.sol", "BatchTest1271Wallet", [await alice.getAddress()]);
await (await payment.mint(await smartWallet.getAddress(), amount)).wait();
const approveData = payment.interface.encodeFunctionData("approve", [await sale.getAddress(), amount]);
await (await smartWallet.connect(alice).execute(await payment.getAddress(), approveData)).wait();
assert.equal(await payment.allowance(await smartWallet.getAddress(), await sale.getAddress()), amount);
const smartOrder = order(await smartWallet.getAddress(), 7);
const smartSignature = await alice.signTypedData(domain, types, smartOrder);
await (await sale.executeBatch([smartOrder], [smartSignature])).wait();
assert.equal(await token.balanceOf(await smartWallet.getAddress()), amount);
// 测试卖出方向时，Token 的输入由 Router 扣取，用户只收到支付币。
await (await token.mint(await bob.getAddress(), amount)).wait();
await (await token.connect(bob).approve(await sale.getAddress(), amount)).wait();
const sellOrder = { ...order(await bob.getAddress(), 8), buy: false };
const sellSignature = await bob.signTypedData(domain, types, sellOrder);
const bobPaymentBefore = await payment.balanceOf(sellOrder.owner);
await (await payment.mint(await router.getAddress(), amount)).wait();
await (await sale.executeBatch([sellOrder], [sellSignature])).wait();
assert.equal(await payment.balanceOf(sellOrder.owner), bobPaymentBefore + amount);
// 订单到达签名的 30 分钟有效期后不可执行。
const expired = order(await alice.getAddress(), 9);
const expiredSignature = await alice.signTypedData(domain, types, expired);
await provider.send("evm_increaseTime", [1801]);
await provider.send("evm_mine", []);
await assert.rejects(sale.executeBatch.staticCall([expired], [expiredSignature]));
console.log("本地测试通过：买卖方向批量成交、ERC-1271、重放阻止、取消、失败原子性和 30 分钟过期。");
