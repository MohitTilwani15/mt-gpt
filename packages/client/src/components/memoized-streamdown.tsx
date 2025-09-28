import React from 'react';
import { Streamdown } from 'streamdown';

interface MemoizedStreamdownProps {
  children: string;
  className?: string;
}

export const MemoizedStreamdown = React.memo<MemoizedStreamdownProps>(
  ({ children, className }) => {
    return (
      <Streamdown className={className}>
        {children}
      </Streamdown>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.children === nextProps.children;
  }
);
