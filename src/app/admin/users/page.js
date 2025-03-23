'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function UserManagement() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newUser, setNewUser] = useState({ username: '', email: '', isAdmin: false, sleeperId: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Redirect if not admin
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
    } else if (status === 'authenticated' && session?.user?.role === 'admin') {
      fetchUsers();
    }
  }, [session, status, router]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    try {
      // Generate a random temporary password
      const tempPassword = Math.random().toString(36).slice(-8);
      
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newUser,
          password: tempPassword,
          passwordChangeRequired: true
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create user');
      }
      
      setSuccess(`User created successfully! Temporary password: ${tempPassword}`);
      setNewUser({ username: '', email: '', isAdmin: false, sleeperId: '' });
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (userId) => {
    try {
      setError('');
      setSuccess('');
      
      // Generate a random temporary password
      const tempPassword = Math.random().toString(36).slice(-8);
      
      const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: tempPassword,
          passwordChangeRequired: true
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset password');
      }
      
      setSuccess(`Password reset successfully! New temporary password: ${tempPassword}`);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-[#001A2B] text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FF4B1F] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#001A2B] text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-[#FF4B1F]">User Management</h1>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-black/30 rounded hover:bg-black/40 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
        
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-white p-4 rounded-lg mb-6">
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-green-500/20 border border-green-500/50 text-white p-4 rounded-lg mb-6">
            {success}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Create User Form */}
          <div className="md:col-span-1">
            <div className="bg-black/30 rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-bold mb-4">Create New User</h2>
              
              <form onSubmit={createUser} className="space-y-4">
                <div>
                  <label htmlFor="username" className="block mb-1">Username</label>
                  <input
                    id="username"
                    type="text"
                    value={newUser.username}
                    onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                    className="w-full p-2 rounded bg-white/5 border border-white/10 text-white"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="email" className="block mb-1">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    className="w-full p-2 rounded bg-white/5 border border-white/10 text-white"
                    placeholder="Optional"
                  />
                </div>
                
                <div>
                  <label htmlFor="sleeperId" className="block mb-1">Sleeper ID</label>
                  <input
                    id="sleeperId"
                    type="text"
                    value={newUser.sleeperId}
                    onChange={(e) => setNewUser({...newUser, sleeperId: e.target.value})}
                    className="w-full p-2 rounded bg-white/5 border border-white/10 text-white"
                    placeholder="Optional"
                  />
                </div>
                
                <div className="flex items-center">
                  <input
                    id="isAdmin"
                    type="checkbox"
                    checked={newUser.isAdmin}
                    onChange={(e) => setNewUser({...newUser, isAdmin: e.target.checked})}
                    className="mr-2"
                  />
                  <label htmlFor="isAdmin">Admin User</label>
                </div>
                
                <button
                  type="submit"
                  className="w-full p-2 bg-[#FF4B1F] rounded hover:bg-[#FF4B1F]/80 transition-colors"
                >
                  Create User
                </button>
              </form>
            </div>
          </div>
          
          {/* User List */}
          <div className="md:col-span-2">
            <div className="bg-black/30 rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-bold mb-4">All Users</h2>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left p-2">Username</th>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">Role</th>
                      <th className="text-left p-2">Password Status</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id} className="border-b border-white/5">
                        <td className="p-2">{user.username}</td>
                        <td className="p-2">{user.email || "-"}</td>
                        <td className="p-2">{user.role === 'admin' ? 'Admin' : 'User'}</td>
                        <td className="p-2">
                          {user.passwordChangeRequired ? (
                            <span className="text-yellow-400">Temporary</span>
                          ) : (
                            <span className="text-green-400">Permanent</span>
                          )}
                        </td>
                        <td className="p-2">
                          <button
                            onClick={() => resetPassword(user.id)}
                            className="text-[#FF4B1F] hover:underline"
                          >
                            Reset Password
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}