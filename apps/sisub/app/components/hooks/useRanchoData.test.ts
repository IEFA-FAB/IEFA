import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { useRanchoData } from './useRanchoData';

// Mock dependencies
jest.mock('../../auth/auth.tsx', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../utils/supabase', () => ({
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({
            order: jest.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
    upsert: jest.fn(() => Promise.resolve({ error: null })),
    delete: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    })),
  })),
}));

const mockUseAuth = require('../../auth/auth').useAuth as jest.MockedFunction<any>;

describe('useRanchoData', () => {
  const mockUser = { id: 'test-user-id' };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUseAuth.mockReturnValue({ user: mockUser });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should generate correct number of dates', () => {
    const { result } = renderHook(() => useRanchoData());
    
    expect(result.current.dates).toHaveLength(30);
    expect(result.current.dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should provide stable callback functions', async () => {
    const { result, rerender } = renderHook(() => useRanchoData());
    
    // Wait for initial render to stabilize
    await act(async () => {
      jest.runAllTimers();
    });

    const initialCallbacks = {
      setSuccess: result.current.setSuccess,
      setError: result.current.setError,
      clearMessages: result.current.clearMessages,
      loadExistingPrevisoes: result.current.loadExistingPrevisoes,
      savePendingChanges: result.current.savePendingChanges,
    };

    rerender();

    expect(result.current.setSuccess).toBe(initialCallbacks.setSuccess);
    expect(result.current.setError).toBe(initialCallbacks.setError);
    expect(result.current.clearMessages).toBe(initialCallbacks.clearMessages);
    expect(result.current.loadExistingPrevisoes).toBe(initialCallbacks.loadExistingPrevisoes);
    expect(result.current.savePendingChanges).toBe(initialCallbacks.savePendingChanges);
  });

  
  it('should auto-clear success message after timeout', async () => {
    const { result } = renderHook(() => useRanchoData());

    // Wait for initial loading
    await act(async () => {
      jest.runAllTimers();
    });

    // Set success message
    await act(async () => {
      result.current.setSuccess('Test success');
    });

    expect(result.current.success).toBe('Test success');

    // Advance timers to trigger auto-clear
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.success).toBe('');
  });

  it('should handle user not being logged in', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    
    const { result } = renderHook(() => useRanchoData());

    await act(async () => {
      jest.runAllTimers();
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('should update default unit correctly', async () => {
    const { result } = renderHook(() => useRanchoData());
    
    // Wait for initial loading
    await act(async () => {
      jest.runAllTimers();
    });

    const newUnit = 'GAP-RJ - HCA';

    await act(async () => {
      result.current.setDefaultUnit(newUnit);
    });

    expect(result.current.defaultUnit).toBe(newUnit);
  });

  it('should handle pending changes correctly', async () => {
    const { result } = renderHook(() => useRanchoData());
    
    // Wait for initial loading
    await act(async () => {
      jest.runAllTimers();
    });

    const testChange = {
      date: '2024-03-15',
      meal: 'almoco' as const,
      value: true,
      unidade: 'DIRAD - DIRAD',
    };

    await act(async () => {
      result.current.setPendingChanges([testChange]);
    });

    expect(result.current.pendingChanges).toEqual([testChange]);
  });
});