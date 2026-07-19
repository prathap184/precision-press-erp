import React from 'react';
export const Button = React.forwardRef<HTMLButtonElement, any>((props, ref) => <button ref={ref} {...props} className={`px-4 py-2 bg-blue-500 text-white rounded ${props.className}`} />);
Button.displayName = "Button";
