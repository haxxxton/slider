import React from 'react';
import classNames from 'classnames';
import shallowEqual from 'shallowequal';
import Track from './common/Track';
import createSlider from './common/createSlider';
import * as utils from './utils';
import { SliderProps } from './Slider';

const trimAlignValue = ({
  value,
  handle,
  bounds,
  props,
}: {
  value: number;
  handle: number;
  bounds?: number[];
  props: RangeProps;
}) => {
  const { allowCross, pushable } = props;
  const thershold = Number(pushable);
  const valInRange = utils.ensureValueInRange(value, props);
  let valNotConflict = valInRange;
  if (!allowCross && handle != null && bounds !== undefined) {
    if (handle > 0 && valInRange <= bounds[handle - 1] + thershold) {
      valNotConflict = bounds[handle - 1] + thershold;
    }
    if (handle < bounds.length - 1 && valInRange >= bounds[handle + 1] - thershold) {
      valNotConflict = bounds[handle + 1] - thershold;
    }
  }
  return utils.ensureValuePrecision(valNotConflict, props);
};

export interface RangeProps {
  value?: number[];
  defaultValue?: number[];
  count?: number;
  min?: number;
  max?: number;
  allowCross?: boolean;
  pushable: boolean;
  onChange?: (value: number[]) => void;
  onBeforeChange?: (value: number[]) => void;
  onAfterChange?: (value: number[]) => void;
  reverse?: boolean;
  vertical?: boolean;
  marks?: Record<number, React.ReactNode | { style?: React.CSSProperties; label?: string }>;
  step?: number;
  threshold?: number;
  prefixCls?: string;
  included?: boolean;
  disabled?: boolean;
  trackDraggable?: boolean;
  trackStyle?: React.CSSProperties;
  handleStyle?: React.CSSProperties;
  tabIndex?: number;
  ariaLabelGroupForHandles?: string;
  ariaLabelledByGroupForHandles?: string;
  ariaValueTextFormatterGroupForHandles?: string;
  handle: SliderProps['handle'];
}

interface RangeState {
  bounds: number[];
  handle: number | null;
  recent: number;
  trackDragPosition: number | null;
}

class Range extends React.Component<RangeProps, RangeState> {
  /**
   * [Legacy] Used for inherit other component.
   * It's a bad code style which should be refactor.
   */
  /* eslint-disable @typescript-eslint/no-unused-vars, class-methods-use-this */
  calcValueByPos(value: number) {
    return 0;
  }

  calcOffset(value: number) {
    return 0;
  }

  saveHandle(index: number, h: HTMLElement | null) {}

  saveTrack(index: number, t: HTMLElement | null) {}

  removeDocumentEvents() {}
  /* eslint-enable */

  static displayName = 'Range';

  static defaultProps = {
    count: 1,
    allowCross: true,
    pushable: false,
    trackDraggable: false,
    tabIndex: [],
    ariaLabelGroupForHandles: [],
    ariaLabelledByGroupForHandles: [],
    ariaValueTextFormatterGroupForHandles: [],
  };

  startValue: number;

  startPosition: number;

  prevMovedHandleIndex: number;

  internalPointsCache: { marks: RangeProps['marks']; step: number; points: number[] };

  handlesRefs: Record<number, HTMLElement>;

  tracksRefs: Record<number, HTMLElement>;

  constructor(props: RangeProps) {
    super(props);

    const { count, min, max } = props;
    const initialValue = Array(...Array(count + 1)).map(() => min);
    const defaultValue = 'defaultValue' in props ? props.defaultValue : initialValue;
    const value = props.value !== undefined ? props.value : defaultValue;
    const bounds = value.map((v, i) =>
      trimAlignValue({
        value: v,
        handle: i,
        props,
      }),
    );
    const recent = bounds[0] === max ? 0 : bounds.length - 1;

    this.state = {
      handle: null,
      recent,
      bounds,
      trackDragPosition: null,
    };
  }

  static getDerivedStateFromProps(props, state) {
    if ('value' in props || 'min' in props || 'max' in props) {
      const value = props.value || state.bounds;
      const nextBounds = value.map((v, i) =>
        trimAlignValue({
          value: v,
          handle: i,
          bounds: state.bounds,
          props,
        }),
      );
      if (
        nextBounds.length === state.bounds.length &&
        nextBounds.every((v, i) => v === state.bounds[i])
      ) {
        return null;
      }
      return {
        ...state,
        bounds: nextBounds,
      };
    }
    return null;
  }

  componentDidUpdate(prevProps, prevState) {
    if (!('value' in this.props || 'min' in this.props || 'max' in this.props)) {
      return;
    }
    if (
      this.props.min === prevProps.min &&
      this.props.max === prevProps.max &&
      shallowEqual(this.props.value, prevProps.value)
    ) {
      return;
    }
    const { onChange, value } = this.props;
    const currentValue = value || prevState.bounds;
    if (currentValue.some(v => utils.isValueOutOfRange(v, this.props))) {
      const newValues = currentValue.map(v => utils.ensureValueInRange(v, this.props));
      onChange(newValues);
    }
  }

  onChange(state) {
    const { props } = this;
    const isNotControlled = !('value' in props);
    if (isNotControlled) {
      this.setState(state);
    } else {
      const controlledState = {};

      ['handle', 'recent'].forEach(item => {
        if (state[item] !== undefined) {
          controlledState[item] = state[item];
        }
      });

      if (Object.keys(controlledState).length && state.trackDragPosition === null) {
        this.setState(controlledState);
      }
    }

    const data = { ...this.state, ...state };
    const changedValue = data.bounds;
    props.onChange(changedValue);
  }

  onStartTrackDrag(position) {
    this.prevMovedHandleIndex = -1;
    this.setState({
      trackDragPosition: position,
    });
  }

  onStart(position) {
    const { props, state } = this;
    const bounds = this.getValue();
    props.onBeforeChange(bounds);

    const value = this.calcValueByPos(position);
    this.startValue = value;
    this.startPosition = position;

    const closestBound = this.getClosestBound(value);
    this.prevMovedHandleIndex = this.getBoundNeedMoving(value, closestBound);

    this.setState({
      handle: this.prevMovedHandleIndex,
      recent: this.prevMovedHandleIndex,
    });

    const prevValue = bounds[this.prevMovedHandleIndex];
    if (value === prevValue) return;

    const nextBounds = [...state.bounds];
    nextBounds[this.prevMovedHandleIndex] = value;
    this.onChange({ bounds: nextBounds });
  }

  onEnd = (force?: boolean) => {
    const { handle } = this.state;
    this.removeDocumentEvents();

    if (handle !== null || force) {
      this.props.onAfterChange(this.getValue());
    }

    this.setState({
      handle: null,
      trackDragPosition: null,
    });
  };

  onMove(e, position) {
    utils.pauseEvent(e);
    const { state, props } = this;
    if (props.trackDraggable && state.trackDragPosition !== null && state.handle === null) {
      const oldPosition = state.trackDragPosition;
      if (oldPosition === position) return;
      const oldValue = this.calcValueByPos(oldPosition);
      const newValue = this.calcValueByPos(position);
      const amount = newValue - oldValue;
      if (amount === 0) return;
      this.moveTrackBy(position, amount);
      return;
    }
    const value = this.calcValueByPos(position);
    const oldValue = state.bounds[state.handle];
    if (value === oldValue) return;

    this.moveTo(value);
  }

  onKeyboard(e) {
    const { reverse, vertical } = this.props;
    const valueMutator = utils.getKeyboardValueMutator(e, vertical, reverse);

    if (valueMutator) {
      utils.pauseEvent(e);
      const { state, props } = this;
      const { bounds, handle } = state;
      const oldValue = bounds[handle === null ? state.recent : handle];
      const mutatedValue = valueMutator(oldValue, props);
      const value = trimAlignValue({
        value: mutatedValue,
        handle,
        bounds: state.bounds,
        props,
      });
      if (value === oldValue) return;
      const isFromKeyboardEvent = true;
      this.moveTo(value, isFromKeyboardEvent);
    }
  }

  getValue() {
    return this.state.bounds;
  }

  getClosestBound(value) {
    const { bounds } = this.state;
    let closestBound = 0;
    for (let i = 1; i < bounds.length - 1; i += 1) {
      if (value >= bounds[i]) {
        closestBound = i;
      }
    }
    if (Math.abs(bounds[closestBound + 1] - value) < Math.abs(bounds[closestBound] - value)) {
      closestBound += 1;
    }
    return closestBound;
  }

  getBoundNeedMoving(value, closestBound) {
    const { bounds, recent } = this.state;
    let boundNeedMoving = closestBound;
    const isAtTheSamePoint = bounds[closestBound + 1] === bounds[closestBound];

    if (isAtTheSamePoint && bounds[recent] === bounds[closestBound]) {
      boundNeedMoving = recent;
    }

    if (isAtTheSamePoint && value !== bounds[closestBound + 1]) {
      boundNeedMoving = value < bounds[closestBound + 1] ? closestBound : closestBound + 1;
    }
    return boundNeedMoving;
  }

  getLowerBound() {
    return this.state.bounds[0];
  }

  getUpperBound() {
    const { bounds } = this.state;
    return bounds[bounds.length - 1];
  }

  /**
   * Returns an array of possible slider points, taking into account both
   * `marks` and `step`. The result is cached.
   */
  getPoints() {
    const { marks, step, min, max } = this.props;
    const cache = this.internalPointsCache;
    if (!cache || cache.marks !== marks || cache.step !== step) {
      const pointsObject = { ...marks };
      if (step !== null) {
        for (let point = min; point <= max; point += step) {
          pointsObject[point] = point;
        }
      }
      const points = Object.keys(pointsObject).map(parseFloat);
      points.sort((a, b) => a - b);
      this.internalPointsCache = { marks, step, points };
    }
    return this.internalPointsCache.points;
  }

  moveTrackBy(position: number, value: number) {
    const { state, props } = this;
    // if applying the value to any bound would take it outside our min/max, dont apply
    const nextBounds = state.bounds.map(bound => bound + value);
    if (nextBounds[0] < props.min || nextBounds[nextBounds.length - 1] > props.max) {
      this.onChange({
        trackDragPosition: position,
      });
      return;
    }
    this.onChange({
      bounds: nextBounds,
      trackDragPosition: position,
    });
  }

  moveTo(value: number, isFromKeyboardEvent?: boolean) {
    const { state, props } = this;
    const nextBounds = [...state.bounds];
    const handle = state.handle === null ? state.recent : state.handle;
    nextBounds[handle] = value;
    let nextHandle = handle;
    if (props.pushable !== false) {
      this.pushSurroundingHandles(nextBounds, nextHandle);
    } else if (props.allowCross) {
      nextBounds.sort((a, b) => a - b);
      nextHandle = nextBounds.indexOf(value);
    }
    this.onChange({
      recent: nextHandle,
      handle: nextHandle,
      bounds: nextBounds,
    });
    if (isFromKeyboardEvent) {
      // known problem: because setState is async,
      // so trigger focus will invoke handler's onEnd and another handler's onStart too early,
      // cause onBeforeChange and onAfterChange receive wrong value.
      // here use setState callback to hack，but not elegant
      this.props.onAfterChange(nextBounds);
      this.setState({}, () => {
        this.handlesRefs[nextHandle].focus();
      });
      this.onEnd();
    }
  }

  pushSurroundingHandles(bounds, handle) {
    const value = bounds[handle];
    const { pushable } = this.props;
    const threshold = Number(pushable);

    let direction = 0;
    if (bounds[handle + 1] - value < threshold) {
      direction = +1; // push to right
    }
    if (value - bounds[handle - 1] < threshold) {
      direction = -1; // push to left
    }

    if (direction === 0) {
      return;
    }

    const nextHandle = handle + direction;
    const diffToNext = direction * (bounds[nextHandle] - value);
    if (!this.pushHandle(bounds, nextHandle, direction, threshold - diffToNext)) {
      // revert to original value if pushing is impossible
      // eslint-disable-next-line no-param-reassign
      bounds[handle] = bounds[nextHandle] - direction * threshold;
    }
  }

  pushHandle(bounds: number[], handle: number, direction: number, amount: number) {
    const originalValue = bounds[handle];
    let currentValue = bounds[handle];
    while (direction * (currentValue - originalValue) < amount) {
      if (!this.pushHandleOnePoint(bounds, handle, direction)) {
        // can't push handle enough to create the needed `amount` gap, so we
        // revert its position to the original value
        // eslint-disable-next-line no-param-reassign
        bounds[handle] = originalValue;
        return false;
      }
      currentValue = bounds[handle];
    }
    // the handle was pushed enough to create the needed `amount` gap
    return true;
  }

  pushHandleOnePoint(bounds, handle, direction) {
    const points = this.getPoints();
    const pointIndex = points.indexOf(bounds[handle]);
    const nextPointIndex = pointIndex + direction;
    if (nextPointIndex >= points.length || nextPointIndex < 0) {
      // reached the minimum or maximum available point, can't push anymore
      return false;
    }
    const nextHandle = handle + direction;
    const nextValue = points[nextPointIndex];
    const { pushable } = this.props;
    const threshold = Number(pushable);
    const diffToNext = direction * (bounds[nextHandle] - nextValue);
    if (!this.pushHandle(bounds, nextHandle, direction, threshold - diffToNext)) {
      // couldn't push next handle, so we won't push this one either
      return false;
    }
    // push the handle
    // eslint-disable-next-line no-param-reassign
    bounds[handle] = nextValue;
    return true;
  }

  trimAlignValue(value) {
    const { handle, bounds } = this.state;
    return trimAlignValue({
      value,
      handle,
      bounds,
      props: this.props,
    });
  }

  render() {
    const { handle, bounds } = this.state;
    const {
      prefixCls,
      vertical,
      included,
      disabled,
      min,
      max,
      reverse,
      handle: handleGenerator,
      trackStyle,
      handleStyle,
      tabIndex,
      trackDraggable,
      ariaLabelGroupForHandles,
      ariaLabelledByGroupForHandles,
      ariaValueTextFormatterGroupForHandles,
    } = this.props;

    const offsets = bounds.map(v => this.calcOffset(v));

    const handleClassName = `${prefixCls}-handle`;
    const handles = bounds.map((v, i) => {
      let mergedTabIndex = tabIndex[i] || 0;
      if (disabled || tabIndex[i] === null) {
        mergedTabIndex = null;
      }
      const dragging = handle === i;
      return handleGenerator({
        className: classNames({
          [handleClassName]: true,
          [`${handleClassName}-${i + 1}`]: true,
          [`${handleClassName}-dragging`]: dragging,
        }),
        prefixCls,
        vertical,
        dragging,
        offset: offsets[i],
        value: v,
        index: i,
        tabIndex: mergedTabIndex,
        min,
        max,
        reverse,
        disabled,
        style: handleStyle[i],
        ref: h => this.saveHandle(i, h),
        ariaLabel: ariaLabelGroupForHandles[i],
        ariaLabelledBy: ariaLabelledByGroupForHandles[i],
        ariaValueTextFormatter: ariaValueTextFormatterGroupForHandles[i],
      });
    });

    const tracks = bounds.slice(0, -1).map((_, index) => {
      const i = index + 1;
      const trackClassName = classNames({
        [`${prefixCls}-track`]: true,
        [`${prefixCls}-track-${i}`]: true,
      });
      return (
        <Track
          className={trackClassName}
          vertical={vertical}
          reverse={reverse}
          included={included}
          offset={offsets[i - 1]}
          length={offsets[i] - offsets[i - 1]}
          setRef={t => this.saveTrack(i, t)}
          style={trackStyle[index]}
          trackDraggable={trackDraggable}
          key={i}
        />
      );
    });

    return { tracks, handles };
  }
}

export default createSlider(Range);
