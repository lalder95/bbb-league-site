'use client';
import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);

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
        console.log("No password change required, redirecting to home");
        router.push('/');
      }
    }
  }, [session, status, router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });
  
      console.log("SignIn result:", result || 'No result returned');
  
      if (!result) {
        throw new Error('Authentication failed - no response');
      }
  
      if (result.error) {
        throw new Error(result.error);
      }
      
      // Rest of your login logic
    } catch (err) {
      console.error("Login error:", err);
      setError(err?.message || 'Authentication failed');
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
        redirect: false
      }).then((result) => {
        if (result.error) {
          throw new Error(result.error);
        }
        router.push('/');
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
            <div className="bg-red-500/20 border border-red-500/50 text-white p-3 rounded-lg mb-4">
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