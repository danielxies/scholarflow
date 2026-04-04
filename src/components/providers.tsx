"use client";

import { ClerkProvider, SignedIn, SignedOut, useAuth } from "@clerk/nextjs";

import { UnauthenticatedView } from "@/features/auth/components/unauthenticated-view";
import { AuthLoadingView } from "@/features/auth/components/auth-loading-view";

import { ThemeProvider } from "./theme-provider";
import { useState, useEffect } from "react";

const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <AuthLoadingView />;
  }

  if (!isSignedIn) {
    return <UnauthenticatedView />;
  }

  return <>{children}</>;
};

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <ClerkProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <AuthGate>
          {children}
        </AuthGate>
      </ThemeProvider>
    </ClerkProvider>
  );
};
