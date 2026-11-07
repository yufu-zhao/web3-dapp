import { shallowReactive } from "vue";
import { getPage, type PageResult } from "./admin-api";

export function useAdminPage<T extends Record<string, unknown>>(
  resource: "users" | "roles" | "menus",
) {
  // 浅层响应式保留泛型行类型，避免 Vue 深层解包将 T[] 推断成 UnwrapRefSimple<T>[]。
  const state = shallowReactive({
    rows: [] as T[],
    page: 1,
    pageSize: 10,
    total: 0,
    search: "",
    filters: {} as Record<string, string | boolean>,
    loading: false,
    error: "",
  });
  let requestId = 0;

  async function load() {
    const currentRequest = ++requestId;
    state.loading = true;
    state.error = "";
    try {
      const result: PageResult<T> = await getPage<T>(
        resource,
        state.page,
        state.pageSize,
        state.search,
        state.filters,
      );
      if (currentRequest !== requestId) return;
      state.rows = result.items;
      state.total = result.total;
      state.page = result.page;
      state.pageSize = result.pageSize;
    } catch (error) {
      if (currentRequest !== requestId) return;
      state.error =
        error instanceof Error ? error.message : "读取数据失败，请重试。";
    } finally {
      if (currentRequest === requestId) state.loading = false;
    }
  }

  function setSearch(value: string) {
    state.search = value;
    state.page = 1;
    void load();
  }

  function setFilter(key: string, value: string | boolean | null) {
    if (value === null || value === "") delete state.filters[key];
    else state.filters[key] = value;
    state.page = 1;
    void load();
  }

  function setPage(value: number) {
    state.page = value;
    void load();
  }

  function setPageSize(value: number) {
    state.pageSize = value;
    state.page = 1;
    void load();
  }

  return { state, load, setSearch, setFilter, setPage, setPageSize };
}
