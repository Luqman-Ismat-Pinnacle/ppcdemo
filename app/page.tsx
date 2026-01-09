/**
 * @fileoverview Home Page Redirect.
 * 
 * The root page of the application redirects to the login page.
 * After authentication, users are redirected to the WBS/Gantt page.
 * 
 * @module app/page
 */

import { redirect } from 'next/navigation';

/**
 * Home page component.
 * Immediately redirects to the login page.
 */
export default function Home() {
  redirect('/login');
}
