// src/app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import clientPromise from "@/lib/mongodb";
import bcrypt from "bcryptjs";

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
          if (!credentials?.username || !credentials?.password) {
            return null;
          }

          // Connect to MongoDB
          const client = await clientPromise;
          const db = client.db("bbb-league");
          const usersCollection = db.collection("users");

          // Find user by username (case-insensitive)
          const user = await usersCollection.findOne({
            username: { $regex: new RegExp("^" + credentials.username + "$", "i") }
          });

          if (!user) {
            return null;
          }

          // Compare password with bcrypt
          const isValid = await bcrypt.compare(credentials.password, user.password);
          if (!isValid) {
            return null;
          }

          // Return user object for session/jwt
          return {
            id: user.id,
            name: user.username, // <-- Add this line
            username: user.username,
            email: user.email,
            role: user.role,
            passwordChangeRequired: user.passwordChangeRequired,
            sleeperId: user.sleeperId,
          };
        } catch (error) {
          console.error("Authorize error:", error);
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
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async session({ session, token }) {
      session.user.id = token.id || token.sub;
      session.user.name = token.name; // <-- Add this line
      session.user.username = token.username;
      session.user.role = token.role;
      session.user.passwordChangeRequired = token.passwordChangeRequired;
      session.user.sleeperId = token.sleeperId;
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name; // <-- Add this line
        token.username = user.username;
        token.role = user.role;
        token.passwordChangeRequired = user.passwordChangeRequired;
        token.sleeperId = user.sleeperId;
      }
      return token;
    },
  },
  debug: true,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };