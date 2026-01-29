/**
 * @fileoverview Centralized Logging Utility
 * 
 * Provides consistent logging throughout the application with:
 * - Environment-aware logging (disabled in production)
 * - Log levels (debug, info, warn, error)
 * - Structured logging for better debugging
 * 
 * @module lib/logger
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
}

class Logger {
  private isDevelopment: boolean;
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 100;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    // Store in history (for debugging)
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    // Only log in development or for errors/warnings
    if (!this.isDevelopment && level === 'debug') {
      return;
    }

    const logMessage = `[${level.toUpperCase()}] ${message}`;
    
    switch (level) {
      case 'debug':
        if (this.isDevelopment) {
          console.debug(logMessage, data || '');
        }
        break;
      case 'info':
        if (this.isDevelopment) {
          console.log(logMessage, data || '');
        }
        break;
      case 'warn':
        console.warn(logMessage, data || '');
        break;
      case 'error':
        console.error(logMessage, data || '');
        break;
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: unknown): void {
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack }
      : error;
    this.log('error', message, errorData);
  }

  /**
   * Get recent log history (for debugging)
   */
  getHistory(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logHistory.filter(entry => entry.level === level);
    }
    return [...this.logHistory];
  }

  /**
   * Clear log history
   */
  clearHistory(): void {
    this.logHistory = [];
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const logDebug = (message: string, data?: unknown) => logger.debug(message, data);
export const logInfo = (message: string, data?: unknown) => logger.info(message, data);
export const logWarn = (message: string, data?: unknown) => logger.warn(message, data);
export const logError = (message: string, error?: unknown) => logger.error(message, error);
