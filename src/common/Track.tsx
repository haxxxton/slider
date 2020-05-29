import React, { useEffect, useRef } from 'react';

const Track = props => {
  const trackRef = useRef();
  const { className, included, vertical, setRef, style } = props;
  let { length, offset, reverse } = props;
  if (length < 0) {
    reverse = !reverse;
    length = Math.abs(length);
    offset = 100 - offset;
  }

  useEffect(() => {
    setRef(trackRef.current);
  });
  const positonStyle = vertical
    ? {
        [reverse ? 'top' : 'bottom']: `${offset}%`,
        [reverse ? 'bottom' : 'top']: 'auto',
        height: `${length}%`,
      }
    : {
        [reverse ? 'right' : 'left']: `${offset}%`,
        [reverse ? 'left' : 'right']: 'auto',
        width: `${length}%`,
      };

  const elStyle = {
    ...style,
    ...positonStyle,
  };
  return included ? <div ref={trackRef} className={className} style={elStyle} /> : null;
};

Track.defaultProps = {
  setRef: () => {},
};

export default Track;
