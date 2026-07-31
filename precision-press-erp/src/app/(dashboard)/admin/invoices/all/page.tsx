import { redirect } from 'next/navigation';

export default function RedirectToDubbl() {
  redirect('http://localhost:3001/sales');
}
