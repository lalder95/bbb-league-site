// src/app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { validateCredentials } from '@/lib/auth-helpers';

// Add more verbose logging for debugging
console.log("Initializing NextAuth with Credentials Provider");

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
          console.log("Authorize called with credentials:", credentials ? { username: credentials.username } : null);
          
          if (!credentials?.username || !credentials?.password) {
            console.error("Missing credentials");
            return null;
          }
          
          // Use the helper function to validate credentials - this calls MongoDB
          console.log(`Attempting to validate user: ${credentials.username}`);
          const user = await validateCredentials(credentials.username, credentials.password);
          
          if (!user) {
            console.error("Invalid credentials for:", credentials.username);
            return null;
          }
          
          console.log("User authenticated successfully:", user.username);
          return user;
        } catch (error) {
          console.error('Auth error:', error);
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
      // Make sure we're correctly passing user information from token to session
      console.log("Session callback called with token:", token);
      // Send properties to the client
      session.user.id = token.id || token.sub;
      session.user.role = token.role;
      session.user.passwordChangeRequired = token.passwordChangeRequired;
      session.user.sleeperId = token.sleeperId;
      console.log("Returning session:", session);
      return session;
    },
    async jwt({ token, user }) {
      // Ensure we add all user properties to the token
      console.log("JWT callback called with user:", user ? { id: user.id, role: user.role } : "No user");
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.passwordChangeRequired = user.passwordChangeRequired;
        token.sleeperId = user.sleeperId;
      }
      console.log("Returning token:", token);
      return token;
    },
  },
  debug: process.env.NODE_ENV !== "production",
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };