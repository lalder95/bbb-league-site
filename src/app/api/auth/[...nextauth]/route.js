import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import path from 'path';
import bcrypt from 'bcryptjs'; // Changed from bcrypt to bcryptjs

// Get the absolute path to the users.json file
const usersFilePath = path.join(process.cwd(), 'src/data/users.json');

// Helper function to read users from file
async function readUsersFile() {
  try {
    const fsPromises = await import('fs/promises');
    const data = await fsPromises.readFile(usersFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
}

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          // Read users from the JSON file
          const users = await readUsersFile();
          
          // Find the user by username
          const user = users.find(user => user.username === credentials.username);
          
          // Check if user exists 
          if (!user) {
            return null;
          }

          // Check if the password matches
          let passwordMatch;
          
          // Handle both hashed and unhashed passwords (for migration)
          if (user.password.startsWith('$2')) {
            // Password is already hashed with bcrypt
            passwordMatch = await bcrypt.compare(credentials.password, user.password);
          } else {
            // For unhashed passwords during transition
            passwordMatch = credentials.password === user.password;
          }
          
          if (passwordMatch) {
            return {
              id: user.id,
              name: user.username,
              email: user.email,
              role: user.role || 'user',
              passwordChangeRequired: user.passwordChangeRequired || false
            };
          }
          
          return null;
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      }
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async session({ session, token }) {
      // Send properties to the client
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.passwordChangeRequired = token.passwordChangeRequired;
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.passwordChangeRequired = user.passwordChangeRequired;
      }
      return token;
    },
  },
  // Add these lines to ensure cookies are properly set
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production"
      }
    }
  },
  debug: process.env.NODE_ENV !== "production",
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };