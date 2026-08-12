import React, { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const LuxuryFallback = () => (
  <div className="fixed inset-0 bg-[#0A0E1A] flex flex-col items-center justify-center z-50">
    <div className="relative flex items-center justify-center">
      <div className="w-16 h-16 rounded-full border-2 border-amber-500/20 animate-ping absolute" />
      <div className="w-12 h-12 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
      <div className="absolute w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-amber-200 opacity-20 blur-sm" />
    </div>
    <p className="mt-4 text-xs font-medium text-amber-200/70 tracking-widest uppercase">
      Đang xác thực phiên làm việc...
    </p>
  </div>
);

export default function ProtectedRoute({
  children,
  fallback = <LuxuryFallback />,
  redirectTo = '/login',
  unauthenticatedElement
}) {
  const { isAuthenticated, isLoadingAuth, authChecked, user } = useAuth();
  const location = useLocation();
  const [supabaseChecking, setSupabaseChecking] = useState(isSupabaseConfigured());
  const [supabaseValidSession, setSupabaseValidSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function checkSupabaseSession() {
      if (!isSupabaseConfigured() || !supabase) {
        if (isMounted) setSupabaseChecking(false);
        return;
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (isMounted) {
          if (error) {
            console.warn('Supabase session verification error:', error.message);
          }
          // Valid if Supabase session exists or user is authenticated locally
          setSupabaseValidSession(!!session || isAuthenticated);
          setSupabaseChecking(false);
        }
      } catch {
        if (isMounted) {
          setSupabaseChecking(false);
        }
      }
    }

    checkSupabaseSession();

    // Listen to Supabase auth state changes for real-time session invalidation
    let authListener = null;
    if (isSupabaseConfigured() && supabase) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (isMounted) {
          setSupabaseValidSession(!!session || isAuthenticated);
        }
      });
      authListener = data?.subscription;
    }

    return () => {
      isMounted = false;
      if (authListener) {
        authListener.unsubscribe();
      }
    };
  }, [isAuthenticated]);

  // Loading state during auth check
  if (isLoadingAuth || !authChecked || supabaseChecking) {
    return fallback;
  }

  // Check overall authentication status
  const isUserAuthenticated = (isAuthenticated || (isSupabaseConfigured() && supabaseValidSession)) && !!user;

  if (!isUserAuthenticated) {
    if (unauthenticatedElement) {
      return unauthenticatedElement;
    }
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  return children ? children : <Outlet />;
}
