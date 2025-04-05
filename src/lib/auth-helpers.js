// src/lib/auth-helpers.js
export async function validateCredentials(username, password) {
  try {
    if (!username) {
      return null;
    }
    
    const user = await getUserByUsername(username);
    if (!user) {
      console.log(`User not found: ${username}`);
      return null;
    }
    
    // DEVELOPMENT MODE BYPASS - Skip password check on localhost
    if (process.env.NODE_ENV === 'development') {
      console.log(`⚠️ DEVELOPMENT MODE: Password check bypassed for user: ${username}`);
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }
    
    // Production mode - Verify password
    let passwordMatch;
    try {
      passwordMatch = await bcrypt.compare(password, user.password);
    } catch (error) {
      console.error('Password comparison error:', error);
      return null;
    }
    
    if (!passwordMatch) {
      console.log(`Invalid password for user: ${username}`);
      return null;
    }
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Error validating credentials:', error);
    return null;
  }
}