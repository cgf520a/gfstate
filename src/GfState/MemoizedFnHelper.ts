class MemoizedFnHelper {
  private impl: (...args: any[]) => any;
  constructor(initialFn: (...args: any[]) => any) {
    // 1. 内部保存当前的实现
    this.impl = initialFn;

    // 2. 创建一个硬绑定的、地址永远不变的 wrapper 函数
    // (相当于 useMemoizedFn 返回的那个函数)
    this.run = this.run.bind(this);
  }

  // 更新内核：当业务逻辑变化时，调用此方法更新
  update(newFn: (...args: any[]) => any) {
    this.impl = newFn;
  }

  // 外壳：拿到的永远是这个函数，地址不变
  run(...args: any[]) {
    // 运行时调用当前最新的 impl
    return this.impl.call(null, ...args);
  }
}

export default MemoizedFnHelper;
