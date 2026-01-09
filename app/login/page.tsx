'use client';

/**
 * @fileoverview Login Page for PPC V3.
 * 
 * Provides user authentication with Supabase:
 * - Email/password form
 * - Demo account button for quick access
 * - Themed styling matching application design
 * - Redirect to WBS/Gantt page after login
 * - Stores user info in context for profile display
 * 
 * @module app/login/page
 */

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useUser, getInitials } from '@/lib/user-context';

/**
 * Login page component with Supabase authentication.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const router = useRouter();
  const { login } = useUser();

  // Check Supabase configuration on mount
  useEffect(() => {
    setSupabaseReady(isSupabaseConfigured());
  }, []);

  // Demo user credentials (must exist in Supabase Auth)
  const demoEmail = 'demo@pinnaclereliability.com';
  const demoPassword = 'demo123';

  /**
   * Handle form submission with Supabase authentication
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (supabaseReady) {
        // Attempt Supabase authentication
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          // If Supabase auth fails, fall back to local auth for demo
          if (email === demoEmail && password === demoPassword) {
            const userInfo = {
              name: 'Demo User',
              email: demoEmail,
              role: 'Project Controls',
              initials: 'DU'
            };
            login(userInfo);
            router.push('/project-controls/wbs-gantt');
            return;
          }
          throw authError;
        }

        if (data.user) {
          // Create user info from Supabase user
          const userName = data.user.user_metadata?.full_name || 
                          data.user.email?.split('@')[0] || 
                          'User';
          const userInfo = {
            name: userName,
            email: data.user.email || '',
            role: data.user.user_metadata?.role || 'User',
            initials: getInitials(userName)
          };
          login(userInfo);
          router.push('/project-controls/wbs-gantt');
        }
      } else {
        // No Supabase configured - use local auth only
        if (email === demoEmail && password === demoPassword) {
          const userInfo = {
            name: 'Demo User',
            email: demoEmail,
            role: 'Project Controls',
            initials: 'DU'
          };
          login(userInfo);
          router.push('/project-controls/wbs-gantt');
        } else {
          setError('Supabase not configured. Use demo credentials.');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Quick login as demo user
   */
  const loginAsDemo = async () => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError('');
    setIsLoading(true);

    try {
      if (supabaseReady) {
        // Try Supabase auth first
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: demoEmail,
          password: demoPassword,
        });

        if (authError) {
          // Fall back to local auth
          const userInfo = {
            name: 'Demo User',
            email: demoEmail,
            role: 'Project Controls',
            initials: 'DU'
          };
          login(userInfo);
          router.push('/project-controls/wbs-gantt');
          return;
        }

        if (data.user) {
          const userInfo = {
            name: 'Demo User',
            email: demoEmail,
            role: 'Project Controls',
            initials: 'DU'
          };
          login(userInfo);
          router.push('/project-controls/wbs-gantt');
        }
      } else {
        // No Supabase - use local auth
        const userInfo = {
          name: 'Demo User',
          email: demoEmail,
          role: 'Project Controls',
          initials: 'DU'
        };
        login(userInfo);
        router.push('/project-controls/wbs-gantt');
      }
    } catch (err) {
      // Fall back to local auth on any error
      const userInfo = {
        name: 'Demo User',
        email: demoEmail,
        role: 'Project Controls',
        initials: 'DU'
      };
      login(userInfo);
      router.push('/project-controls/wbs-gantt');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen w-full p-3">
      <div className="chart-card" style={{ maxWidth: '300px', width: '100%', padding: '1.75rem' }}>
        {/* Logo */}
        <div className="flex justify-center" style={{ marginBottom: '1.25rem' }}>
          <Image
            src="/logo.png"
            alt="Pinnacle"
            width={60}
            height={60}
            priority
            className="object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        </div>
        
        {/* Title */}
        <h1 className="page-title text-center" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Pinnacle Project Controls
        </h1>
        
        {/* Supabase Status Indicator */}
        {!supabaseReady && (
          <div style={{
            padding: '0.5rem',
            marginBottom: '1rem',
            borderRadius: '6px',
            fontSize: '0.6rem',
            textAlign: 'center',
            backgroundColor: 'rgba(255, 193, 7, 0.1)',
            color: 'rgba(255, 193, 7, 0.9)',
            border: '1px solid rgba(255, 193, 7, 0.3)'
          }}>
            Database not configured. Demo mode only.
          </div>
        )}
        
        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label 
              className="block font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-muted)', marginBottom: '0.25rem', fontSize: '0.5rem' }}
            >
              Email Address
            </label>
            <input
              type="email"
              className="w-full rounded-lg outline-none transition-all"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '0.5rem 1.25rem',
                fontSize: '0.5rem'
              }}
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--pinnacle-teal)';
                e.target.style.background = 'var(--bg-tertiary)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border-color)';
                e.target.style.background = 'var(--bg-secondary)';
              }}
              disabled={isLoading}
              required
            />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label 
              className="block font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-muted)', marginBottom: '0.25rem', fontSize: '0.5rem' }}
            >
              Password
            </label>
            <input
              type="password"
              className="w-full rounded-lg outline-none transition-all"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '0.5rem 1.25rem',
                fontSize: '0.5rem'
              }}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--pinnacle-teal)';
                e.target.style.background = 'var(--bg-tertiary)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border-color)';
                e.target.style.background = 'var(--bg-secondary)';
              }}
              disabled={isLoading}
              required
            />
          </div>
          
          {error && (
            <div 
              className="text-center font-medium"
              style={{ color: 'var(--color-error)', marginTop: '0.25rem', fontSize: '0.5rem' }}
            >
              {error}
            </div>
          )}
          
          <button 
            type="submit" 
            className="btn btn-primary w-full"
            style={{ 
              padding: '0.5rem',
              fontSize: '0.5rem',
              fontWeight: 700,
              marginTop: '0.5rem',
              opacity: isLoading ? 0.7 : 1
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        
        {/* Demo Account */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
          <p 
            className="uppercase tracking-widest text-center"
            style={{ color: 'var(--text-muted)', marginBottom: '0.75rem', fontSize: '0.5rem' }}
          >
            Quick Access
          </p>
          <button 
            onClick={loginAsDemo} 
            className="font-medium rounded transition-all w-full"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              padding: '0.625rem 1rem',
              fontSize: '0.6rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: isLoading ? 0.7 : 1
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.background = 'var(--pinnacle-teal)';
                e.currentTarget.style.borderColor = 'var(--pinnacle-teal)';
                e.currentTarget.style.color = '#000';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
              e.currentTarget.style.borderColor = 'var(--border-color)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            type="button"
            disabled={isLoading}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Sign in as Demo User
          </button>
        </div>
      </div>
    </div>
  );
}
