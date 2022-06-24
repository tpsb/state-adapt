import { createSelector } from 'reselect';
import { flatten } from './utils/flatten.function';
import { defer, merge, NEVER, Observable, of, using } from 'rxjs';
import { distinctUntilChanged, filter, finalize, share, tap } from 'rxjs/operators';
import type { Action } from './action.interface';
import { createDestroy, createInit, createPatchState } from './adapt.actions';
import { Adapter, ReactionsWithSelectors } from './adapter.type';
import { createBasicAdapter } from './create-basic-adapter.function';
import { MiniStore } from './mini-store.interface';
import { Reactions } from './reactions.interface';
import { Selections } from './selections.type';
import { Selectors } from './selectors.interface';
import { Sources } from './sources.type';
import { BasicAdapterMethods } from './create-adapter.function';
import { getAction } from './get-action.function';
import { SyntheticSources } from './synthetic-sources.type';
import { WithGetState } from './with-get-state.type';

let pathId = 0;
function getUniquePath(path: string) {
  return `${path}|${pathId++}`;
}

interface ParsedPath {
  path: string;
  pathAr: string[];
}

const filterDefined = <T>(sel$: Observable<T>) =>
  sel$.pipe(
    filter(a => a !== undefined),
    distinctUntilChanged(),
  );

interface StoreMethods {
  select: (sel: any) => Observable<any>;
  dispatch: (action: any) => any;
}

interface PathState {
  lastState: any;
  initialState: any;
  arr: string[];
}

interface PathStates {
  [index: string]: undefined | PathState;
}

interface UpdaterStream {
  source$: Observable<Action<any>>;
  requireSources$: Observable<any>;
  reactions: {
    path: string;
    reaction: (...args: any[]) => any;
  }[];
}

export class AdaptCommon<CommonStore extends StoreMethods = any> {
  private pathStates: PathStates = {};
  private updaterStreams: UpdaterStream[] = [];

  constructor(private commonStore: CommonStore) {}

  init<State, S extends Selectors<State>, R extends ReactionsWithSelectors<State, S>>(
    [path, adapter, initialState]: [string, Adapter<State, S, R>, State],
    sources: Sources<State, S, R> = {},
  ): MiniStore<State, S & WithGetState<State>> & SyntheticSources<R> {
    const pathObj = this.parsePath(path);
    // type S = R['selectors'];
    const selectors = adapter.selectors || ({} as S);
    const reactions = { ...adapter } as Reactions<State>;
    delete reactions.selectors;
    const [requireSources$, syntheticSources] = this.getRequireSources<
      State,
      S,
      R,
      SyntheticSources<R>
    >(reactions, pathObj, sources, initialState);

    const getState = this.getStateSelector<State>(pathObj.pathAr);
    const { fullSelectors, selections } = this.getSelections<State, S>(
      selectors,
      getState,
      requireSources$,
    );

    return {
      ...syntheticSources,
      ...selections,
      _requireSources$: requireSources$,
      _fullSelectors: fullSelectors,
      _select: (sel: any) => filterDefined(this.commonStore.select(sel)),
    };
  }

  initGet<State, S extends Selectors<State>, R extends ReactionsWithSelectors<State, S>>(
    [path, adapter, initialState]: [string, Adapter<State, S, R>, State],
    sources: Sources<State, S, R>,
  ): Observable<State> {
    const pathObj = this.parsePath(path);
    const reactions = { ...adapter } as Reactions<State>;
    delete reactions.selectors;
    const [requireSources$] = this.getRequireSources<State, S, R, SyntheticSources<R>>(
      reactions,
      pathObj,
      sources,
      initialState,
    );

    const getState = this.getStateSelector<State>(pathObj.pathAr);

    return using(
      () => requireSources$.subscribe(),
      () => filterDefined(this.commonStore.select(getState)),
    );
  }

  setter<State>(
    path: string,
    initialState: State,
    source$: Observable<Action<State>> | Observable<Action<State>>[],
  ) {
    return this.initGet([path, createBasicAdapter<State>(), initialState], {
      set: source$,
    });
  }
  updater<State>(
    path: string,
    initialState: State,
    source$: Observable<Action<Partial<State>>> | Observable<Action<Partial<State>>>[],
  ) {
    return this.initGet([path, createBasicAdapter<State>(), initialState], {
      update: source$,
    });
  }

  /**
   * Returns a detached store; doesn't chain off of sources.
   * Path must be correct.
   */
  spy<State, S extends Selectors<State>, R extends ReactionsWithSelectors<State, S>>(
    path: string,
    adapter: Adapter<State, S, R & BasicAdapterMethods<State>>,
    //
  ): MiniStore<State, S & { state: (state: any) => State }> {
    const selectors = adapter.selectors || ({} as S);
    const getState = this.getStateSelector<State>(path.split('.'));
    const requireSources$ = of(null);
    const { fullSelectors, selections } = this.getSelections<State, S>(
      selectors,
      getState,
      requireSources$,
    );
    return {
      ...selections,
      _requireSources$: requireSources$,
      _fullSelectors: fullSelectors,
      _select: (sel: any) => filterDefined(this.commonStore.select(sel)),
    };
  }

  private parsePath(path: string): ParsedPath {
    let collisionFreePath: string | undefined;
    Object.keys(this.pathStates).find(existingPath => {
      if (path === existingPath) {
        return (collisionFreePath = getUniquePath(path));
      }

      if (existingPath + '.' === path.substr(0, existingPath.length + 1)) {
        const oldPathStem = path.substr(0, existingPath.length);
        return (collisionFreePath =
          getUniquePath(oldPathStem) + path.substr(existingPath.length));
      }

      if (path + '.' === existingPath.substr(0, path.length + 1)) {
        return (collisionFreePath = getUniquePath(path));
      }
    });

    const goodPath = collisionFreePath || path;
    if (path !== goodPath) {
      this.warnPathCollision(path, goodPath);
    }
    this.pathStates[goodPath] = undefined;
    return { path: goodPath, pathAr: goodPath.split('.') };
  }

  private getRequireSources<
    State,
    S extends Selectors<State>,
    R extends ReactionsWithSelectors<State, S>,
    RSS extends SyntheticSources<R>,
  >(
    reactions: Reactions<State>,
    { path, pathAr }: ParsedPath,
    sources: Sources<State, S, R>,
    initialState: State,
  ): [Observable<any>, RSS] {
    const reactionEntries = Object.entries(reactions);
    const allSourcesWithReactions = flatten(
      reactionEntries.map(([reactionName, reaction]) => {
        const reactionSource = sources[reactionName] || [];
        const reactionSources = Array.isArray(reactionSource)
          ? reactionSource
          : [reactionSource];
        return reactionSources.map(source$ => ({ source$, reaction }));
      }),
    );

    const allUpdatesFromSources$ = allSourcesWithReactions.map(
      ({ source$, reaction }, i) => {
        // Source-grouped updates:
        return defer(() => {
          const updaterStream = this.getSourceUpdateStream(source$);
          const requireSources$ = updaterStream
            ? updaterStream.requireSources$
            : source$.pipe(
                tap(action => {
                  const updates = this.getAllSourceUpdates(source$, action);
                  this.commonStore.dispatch(createPatchState(action, updates));
                }),
                finalize(() => {
                  this.updaterStreams.splice(
                    this.updaterStreams.findIndex(
                      ({ source$: updaterSource$ }) => source$ === updaterSource$,
                    ),
                    1,
                  );
                }),
                share(),
              );
          if (!updaterStream) {
            this.updaterStreams.push({
              source$,
              requireSources$,
              reactions: [],
            });
          }
          // Now there is definitely an update stream for this source, so push this reaction onto it
          const updateStream = this.getSourceUpdateStream(source$);
          updateStream?.reactions.push({ path, reaction });
          return requireSources$;
        }).pipe(share());
      },
    );

    const requireSources$ = defer(() => {
      // Runs first upon subscription.
      // If any of the sources emits immediately, this needs to have been set up first.
      this.commonStore.dispatch(createInit(path, initialState));
      this.pathStates[path] = {
        lastState: initialState,
        initialState,
        arr: pathAr,
      };
      return merge(...allUpdatesFromSources$, NEVER); // If sources all complete, keep state in the store
    }).pipe(
      finalize(() => {
        // Runs Last to clean up the store:
        allSourcesWithReactions.forEach(({ source$ }) => {
          const updateStream = this.getSourceUpdateStream(source$);
          const updateReactions = updateStream?.reactions || [];
          updateReactions.splice(
            updateReactions.findIndex(({ path: reactionPath }) => reactionPath === path),
            1,
          );
        });
        delete this.pathStates[path];
        this.commonStore.dispatch(createDestroy(path));
      }),
      share(),
    );

    const syntheticSources = reactionEntries.reduce((acc, [reactionName, reaction]) => {
      return {
        ...acc,
        [reactionName]: (payload: any) => {
          const update = this.getUpdate(path, reaction, payload);
          const action = getAction(`[${pathAr.join('] [')}] ${reactionName}`, payload);
          this.commonStore.dispatch(createPatchState(action, [update]));
        },
      };
    }, {} as RSS);

    return [requireSources$, syntheticSources];
  }

  private getSourceUpdateStream(searchSource$: Observable<Action<any>>) {
    return this.updaterStreams.find(
      ({ source$ }) => searchSource$ === source$,
    ) as UpdaterStream;
  }

  private getAllSourceUpdates(
    source$: Observable<Action<any>>,
    { payload }: Action<any>,
  ): [string[], any][] {
    return this.getSourceUpdateStream(source$).reactions.map(({ path, reaction }) =>
      this.getUpdate(path, reaction, payload),
    );
  }

  private getUpdate(
    path: string,
    reaction: (...args: any[]) => any,
    payload: any,
  ): [string[], any] {
    const pathState = this.pathStates[path];
    if (pathState === undefined) {
      throw `Cannot apply update before store "${path}" is initialized.`;
    }
    const { lastState, initialState, arr } = pathState;
    const newState = reaction(lastState, payload, initialState);
    pathState.lastState = newState;
    return [arr, newState];
  }

  private getStateSelector<State>(
    pathAr: string[],
  ): ({ adapt }: { adapt: any }) => State {
    return ({ adapt }) =>
      pathAr.reduce((state, segment) => state && state[segment], adapt);
  }

  private warnPathCollision(path: string, collisionFreePath: string) {
    console.warn(
      `Path '${path}' collides with an already instantiated path, so it has been modified to '${collisionFreePath}'`,
    );
  }

  private getSelections<State, S extends Selectors<State>>(
    selectors: S,
    getState: ({ adapt }: { adapt: any }) => State,
    requireSources$: Observable<any>,
  ): {
    fullSelectors: S & { state: () => State };
    selections: Selections<State, S>;
  } {
    const getUsing = <T>(selection$: Observable<T>) =>
      using(
        () => requireSources$.subscribe(),
        () => filterDefined(selection$),
      );
    const selections: {
      fullSelectors: S & { state: () => State };
      selections: Selections<State, S>;
    } = Object.keys(selectors).reduce(
      (selected, key) => {
        const fullSelector = createSelector([getState], (state: State, props: any) =>
          state !== undefined ? selectors[key](state, props) : state,
        );
        return {
          fullSelectors: { ...selected.fullSelectors, [key]: fullSelector },
          selections: {
            ...selected.selections,
            [key + '$']: getUsing(this.commonStore.select(fullSelector)),
          },
        };
      },
      {
        fullSelectors: { state: getState },
        selections: {
          state$: getUsing(this.commonStore.select(getState)),
        },
      } as {
        fullSelectors: S & { state: () => State };
        selections: Selections<State, S>;
      },
    );

    return selections;
  }
}
