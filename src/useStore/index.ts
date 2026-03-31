import React, { useRef } from 'react';
import gfstate, {
  type Store,
  type Options,
  type TransformData,
} from '../GfState';

export interface StoreWithStateAndProps<
  State extends Record<string, any> = Record<string, any>,
  Props extends Record<string, any> = Record<string, any>,
  Action extends Record<string, any> = Record<string, any>,
  Ref extends Record<string, any> = Record<string, any>,
  ExcludeKeys extends keyof State = never,
> {
  state: Store<TransformData<State, ExcludeKeys>>;
  props: Store<Props>;
  action: Store<Action>;
  ref: Ref;
}

interface LifecycleProps<T = Record<string, any>> {
  /**
   * 在 store 创建前调用，运行在渲染阶段。
   * 注意：应保持同步且无副作用，在 React 严格模式/并发模式下可能被多次调用。
   */
  beforeCreate?: () => void;
  /**
   * 在 store 创建后同步调用，仅在首次渲染时执行。
   * 可以使用 store 实例进行初始数据加载等操作。
   */
  created?: (store: Store<T>) => void;
  /**
   * 在组件挂载后调用（useEffect 内），适合执行副作用如订阅、定时器、DOM 操作。
   */
  mounted?: (store: Store<T>) => void;
  /**
   * 在组件卸载时调用（useEffect 清理函数内），用于清理订阅、定时器等资源。
   */
  unmounted?: (store: Store<T>) => void;
}

/**
 * state 声明的状态，可以改变
 * props是只读的，是上级组件传给下级组件的，只是存到store中方便子组件取值，只在props变化时变化
 * action 方法和函数放在action中,action和state一样只能手动更新，虽然action可以放入state中，但这样更清晰
 * ref 增加一个放置普通变量，不会引起视图更新的,但是跟随store生命周期
 * computed和watch暂时不提供，后续有需求再处理,
 * options针对状态的配置
 */

const useStore = <
  State extends Record<string, any> = Record<string, any>,
  Props extends Record<string, any> = Record<string, any>,
  Action extends Record<string, any> = Record<string, any>,
  Ref extends Record<string, any> = Record<string, any>,
  ExcludeKeys extends keyof State = never,
>({
  state = {} as State,
  props = {} as Props,
  action = {} as Action,
  ref = {} as Ref,
  lifecycle,
  options,
}: {
  // state?: State | (() => State) | (() => Promise<State>);
  state?: State;
  props?: Props;
  action?: Action;
  ref?: Ref;
  lifecycle?: LifecycleProps<
    StoreWithStateAndProps<State, Props, Action, Ref, ExcludeKeys>
  >;
  options?: Options<State, ExcludeKeys>;
}) => {
  const varRef = useRef<Ref>(ref);
  const marked = useRef<boolean>(false);
  if (!marked.current) {
    lifecycle?.beforeCreate?.();
  }

  const store = useRef<
    Store<StoreWithStateAndProps<State, Props, Action, Ref, ExcludeKeys>>
  >(null!);

  if (!store.current) {
    store.current = gfstate({
      state: gfstate<State, ExcludeKeys>(state, options),
      props: gfstate<Props>({ ...props } as Props),
      action: gfstate<Action>(action),
      ref: varRef.current,
    }) as Store<StoreWithStateAndProps<State, Props, Action, Ref, ExcludeKeys>>;
  }

  if (!marked.current) {
    // 创建后可以使用store.current进行一些操作
    lifecycle?.created?.(store.current);
    marked.current = true;
  }
  store.current.props(props);
  store.current.action(action);

  React.useEffect(() => {
    lifecycle?.mounted?.(store.current);

    return () => {
      lifecycle?.unmounted?.(store.current);
    };
  }, []);

  return store.current;
};

export default useStore;
