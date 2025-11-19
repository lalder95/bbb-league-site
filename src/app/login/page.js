'use client';
import { useState, useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrlParam = searchParams?.get('callbackUrl');
  const callbackUrl = callbackUrlParam || '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);

  // Map NextAuth error codes to user-friendly messages
  const mapAuthError = (code) => {
    const lookup = {
      CredentialsSignin: 'Invalid username or password. Please try again.',
      AccessDenied: 'Access denied. You might not have permission to sign in.',
      OAuthSignin: 'Could not start the sign-in flow. Please try again.',
      OAuthCallback: 'Sign-in failed during provider callback. Please try again.',
      OAuthCreateAccount: 'We could not create your account with the selected provider.',
      EmailCreateAccount: 'We could not create your account with email sign-in.',
      Callback: 'Sign-in failed during callback. Please try again.',
      OAuthAccountNotLinked: 'This email is already linked with a different sign-in method. Use the original provider.',
      EmailSignin: 'Email sign-in is not enabled.',
      Configuration: 'Authentication is not configured correctly. Please contact an admin.',
      Verification: 'The sign-in link is invalid or has expired.',
      default: 'Could not sign you in. Please try again.'
    };
    return lookup[code] || lookup.default;
  };

  // Handle session state and redirects carefully
  useEffect(() => {
    console.log("Session status:", status);
    console.log("Session data:", session);
    
    if (status === 'authenticated' && session) {
      console.log("Password change required from session:", session.user?.passwordChangeRequired);
      
      if (session.user?.passwordChangeRequired) {
        console.log("Setting password change required state to true");
        setPasswordChangeRequired(true);
      } 
      // Only redirect if passwordChangeRequired is explicitly false
      else if (session.user?.passwordChangeRequired === false) {
        console.log("No password change required, redirecting to callbackUrl:", callbackUrl);
        router.push(callbackUrl);
      }
    }
  }, [session, status, router, callbackUrl]);

  // Pick up error= query param from NextAuth redirects (or other callers)
  useEffect(() => {
    const errCode = searchParams?.get('error');
    if (errCode) {
      setError(mapAuthError(errCode));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

     // Basic client-side validation for clearer feedback
    if (!username?.trim() || !password) {
      setIsLoading(false);
      setError('Please enter both username and password.');
      return;
    }
    
    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
        callbackUrl,
      });
  
      console.log("SignIn result:", result || 'No result returned');
  
      if (!result) {
        throw new Error('NetworkError');
      }
  
      if (result.error) {
        // result.error is typically a NextAuth code like "CredentialsSignin"
        throw new Error(result.error);
      }
      
      // Rest of your login logic
    } catch (err) {
      console.error("Login error:", err);
      const message = err?.message;
      if (message === 'NetworkError') {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(mapAuthError(message));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    // Validate passwords
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }
    
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }
    
    try {
      console.log("Submitting password change");
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newPassword,
          username, // Pass the username explicitly
        }),
      });
      
      console.log("Password change response:", response);
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password');
      }
      
      // Password changed successfully
      console.log("Password changed successfully");
      alert('Password changed successfully!');
      
      // Sign out and redirect to login to get a fresh session
      signIn('credentials', {
        username,
        password: newPassword,
        redirect: false,
        callbackUrl,
      }).then((result) => {
        if (result?.error) {
          throw new Error(result.error);
        }
        // After successful re-authentication, go back to the original page
        router.push(callbackUrl);
        router.refresh();
      });
    } catch (err) {
      console.error("Password change error:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // If password change is required, show password change form
  if (passwordChangeRequired) {
    return (
      <main className="min-h-screen bg-[#001A2B] text-white flex items-center justify-center">
        <div className="bg-black/30 rounded-lg border border-white/10 p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-[#FF4B1F] mb-6 text-center">Change Your Password</h1>
          <p className="mb-6 text-white/70 text-center">
            You must change your temporary password before continuing.
          </p>
          
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-white p-3 rounded-lg mb-4" role="alert" aria-live="assertive">
              {error}
            </div>
          )}
          
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block mb-2">New Password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full p-3 rounded bg-white/5 border border-white/10 text-white"
                required
                minLength={8}
              />
            </div>
            
            <div>
              <label htmlFor="confirm-password" className="block mb-2">Confirm New Password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-3 rounded bg-white/5 border border-white/10 text-white"
                required
                minLength={8}
              />
            </div>
            
            <button
              type="submit"
              className="w-full p-3 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors flex items-center justify-center"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              ) : (
                'Change Password'
              )}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Normal login form
  return (
    <main className="min-h-screen bg-[#001A2B] text-white flex items-center justify-center">
      <div className="bg-black/30 rounded-lg border border-white/10 p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-[#FF4B1F] mb-6 text-center">Login to BBB League</h1>
        
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-white p-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="username" className="block mb-2">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 rounded bg-white/5 border border-white/10 text-white"
              required
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block mb-2">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded bg-white/5 border border-white/10 text-white"
              required
            />
          </div>
          
          <button
            type="submit"
            className="w-full p-3 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors flex items-center justify-center"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            ) : (
              'Login'
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#001A2B] text-white flex items-center justify-center">Loading...</div>}>
      <LoginInner />
    </Suspense>
  );
}