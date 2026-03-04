'use client';

/**
 * @fileoverview Dynamic Help Detail Page for PPC V3.
 * 
 * Displays help content for a specific page, identified by [pageId] route param.
 * Shows features, FAQs, guided tour steps, and related pages.
 * 
 * Features:
 * - Page-specific documentation
 * - Feature highlights with icons
 * - Frequently asked questions with expandable answers
 * - Guided tour step definitions
 * - Related pages navigation
 * - 404 handling for unknown page IDs
 * 
 * @module app/help/[pageId]/page
 */

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getHelpContent, HELP_CONTENT } from '@/lib/help-content';

export default function HelpDetailPage() {
  const params = useParams();
  const pageId = params.pageId as string;
  const content = getHelpContent(pageId);

  // Handle unknown page
  if (!content) {
    return (
      <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Page Not Found</h1>
            <p className="page-description">
              The help article you&apos;re looking for doesn&apos;t exist.
            </p>
          </div>
        </div>
        <div className="chart-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            We couldn&apos;t find help content for &quot;{pageId}&quot;.
          </p>
          <Link href="/help" className="btn btn-primary btn-sm">
            Back to Help Center
          </Link>
        </div>
      </div>
    );
  }

  // Get related pages
  const relatedPages = content.relatedPages
    .map(id => HELP_CONTENT[id])
    .filter(Boolean);

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Link
              href="/help"
              style={{
                color: 'var(--text-muted)',
                textDecoration: 'none',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              ← Help Center
            </Link>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>
            <span
              style={{
                fontSize: '0.7rem',
                padding: '0.2rem 0.5rem',
                background: content.category === 'Insights' ? 'rgba(64, 224, 208, 0.1)' :
                           content.category === 'Project Controls' ? 'rgba(205, 220, 57, 0.1)' :
                           content.category === 'Project Management' ? 'rgba(233, 30, 99, 0.1)' :
                           'rgba(255, 152, 0, 0.1)',
                color: content.category === 'Insights' ? 'var(--pinnacle-teal)' :
                      content.category === 'Project Controls' ? 'var(--pinnacle-lime)' :
                      content.category === 'Project Management' ? 'var(--pinnacle-pink)' :
                      'var(--pinnacle-orange)',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              {content.category}
            </span>
          </div>
          <h1 className="page-title">{content.title}</h1>
          <p className="page-description">
            {content.description}
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="chart-card">
        <div className="chart-card-header">
          <h3 className="chart-card-title">Features</h3>
        </div>
        <div className="chart-card-body" style={{ padding: '1rem' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '1rem',
          }}>
            {content.features.map((feature, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  padding: '1rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>{feature.icon}</span>
                <div>
                  <h4 style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '0.25rem',
                  }}>
                    {feature.title}
                  </h4>
                  <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}>
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tour Steps */}
      {content.tour.length > 0 && (
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Quick Tour</h3>
            <span className="badge badge-teal">{content.tour.length} steps</span>
          </div>
          <div className="chart-card-body" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {content.tour.map((step, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'var(--pinnacle-teal)',
                    color: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    flexShrink: 0,
                  }}>
                    {idx + 1}
                  </div>
                  <div>
                    <h4 style={{
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: '0.25rem',
                    }}>
                      {step.title}
                    </h4>
                    <p style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                    }}>
                      {step.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FAQs */}
      {content.faqs.length > 0 && (
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Frequently Asked Questions</h3>
          </div>
          <div className="chart-card-body no-padding">
            {content.faqs.map((faq, idx) => (
              <div
                key={idx}
                style={{
                  padding: '1rem 1.25rem',
                  borderBottom: idx < content.faqs.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <h4 style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--pinnacle-teal)',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <span style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'rgba(64, 224, 208, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}>
                    Q
                  </span>
                  {faq.question}
                </h4>
                <p style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  marginLeft: '1.625rem',
                }}>
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Pages */}
      {relatedPages.length > 0 && (
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Related Topics</h3>
          </div>
          <div className="chart-card-body" style={{ padding: '1rem' }}>
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}>
              {relatedPages.map(page => (
                <Link
                  key={page.id}
                  href={`/help/${page.id}`}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-secondary)',
                    textDecoration: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--pinnacle-teal)';
                    e.currentTarget.style.color = 'var(--pinnacle-teal)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  {page.title} →
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 0',
      }}>
        <Link href="/help" className="btn btn-secondary btn-sm">
          ← Back to Help Center
        </Link>
        <p style={{
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}>
          Need more help? Contact support.
        </p>
      </div>
    </div>
  );
}

