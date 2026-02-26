/**
 * @fileoverview Legacy COO AI route redirect to COO command center.
 */

import { redirect } from 'next/navigation';

export default function CooAiRedirectPage() {
  redirect('/role-views/coo');
}
