export const Table = ({ children, className }: any) => <table className={`min-w-full ${className}`}>{children}</table>;
export const TableHeader = ({ children, className }: any) => <thead className={className}>{children}</thead>;
export const TableBody = ({ children, className }: any) => <tbody className={className}>{children}</tbody>;
export const TableRow = ({ children, className }: any) => <tr className={className}>{children}</tr>;
export const TableHead = ({ children, className }: any) => <th className={`px-4 py-2 text-left ${className}`}>{children}</th>;
export const TableCell = ({ children, className }: any) => <td className={`px-4 py-2 ${className}`}>{children}</td>;
