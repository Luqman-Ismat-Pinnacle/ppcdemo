'use client';

/**
 * @fileoverview Help Center Landing Page for PPC V3.
 * 
 * Provides a searchable index of all help content, organized by category.
 * Users can browse help topics for every page in the application.
 * 
 * Features:
 * - Real-time search across all help content
 * - Organized by category (General, Insights, Project Controls, Project Management)
 * - Quick links to each page's help documentation
 * - Feature highlights and card-based design
 * 
 * @module app/help/page
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { getHelpContentByCategory, searchHelpContent, PageHelpContent } from '@/lib/help-content';

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const contentByCategory = getHelpContentByCategory();
  
  // Filter content based on search
  const displayContent = useMemo(() => {
    if (!searchQuery.trim()) {
      return contentByCategory;
    }
    
    const results = searchHelpContent(searchQuery);
    const filtered: Record<string, PageHelpContent[]> = {};
    
    results.forEach(content => {
      if (!filtered[content.category]) {
        filtered[content.category] = [];
      }
      filtered[content.category].push(content);
    });
    
    return filtered;
  }, [searchQuery, contentByCategory]);

  // Category order
  const categoryOrder = ['General', 'Insights', 'Project Controls', 'Project Management'];

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Help Center</h1>
        </div>
        <Link href="/" className="btn btn-secondary btn-sm">
          ← Back to App
        </Link>
      </div>

      {/* Search Bar */}
      <div className="chart-card" style={{ padding: '1rem' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search help articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2.5rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              outline: 'none',
              transition: 'border-color 0.2s ease',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--pinnacle-teal)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
          />
          {/* Search Icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Help Categories */}
      {categoryOrder.map(category => {
        const pages = displayContent[category];
        if (!pages || pages.length === 0) return null;

        return (
          <div key={category}>
            <h2 style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{
                width: '4px',
                height: '16px',
                background: category === 'Insights' ? 'var(--pinnacle-teal)' :
                           category === 'Project Controls' ? 'var(--pinnacle-lime)' :
                           category === 'Project Management' ? 'var(--pinnacle-pink)' :
                           'var(--pinnacle-orange)',
                borderRadius: '2px',
              }} />
              {category}
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}>
              {pages.map(page => (
                <Link
                  key={page.id}
                  href={`/help/${page.id}`}
                  style={{
                    textDecoration: 'none',
                    display: 'block',
                  }}
                >
                  <div
                    className="chart-card"
                    style={{
                      padding: '1.25rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      height: '100%',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--pinnacle-teal)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <h3 style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: '0.5rem',
                    }}>
                      {page.title}
                    </h3>
                    <p style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                      marginBottom: '1rem',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {page.description}
                    </p>
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}>
                      {page.features.slice(0, 3).map((feature, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.25rem 0.5rem',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {feature.icon} {feature.title}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {/* No Results */}
      {Object.keys(displayContent).length === 0 && (
        <div className="chart-card" style={{
          padding: '3rem',
          textAlign: 'center',
        }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            No help articles found for &quot;{searchQuery}&quot;
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="btn btn-secondary btn-sm"
          >
            Clear Search
          </button>
        </div>
      )}
    </div>
  );
}

