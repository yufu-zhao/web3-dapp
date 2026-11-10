const formatNumberDefaultOptions = { default: "--", decimals: 0 }
export function formatNumber(num?: number | string, options?: typeof formatNumberDefaultOptions) {
    const opt = { ...formatNumberDefaultOptions, ...options }
    if (!num && num != 0) return opt.default;
    return Number(num).toFixed(opt.decimals);
}