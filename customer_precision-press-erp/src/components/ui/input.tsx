import React from 'react';
export const Input = React.forwardRef<HTMLInputElement, any>((props, ref) => <input ref={ref} {...props} className={`border px-2 py-1 rounded ${props.className}`} />);
Input.displayName = "Input";
