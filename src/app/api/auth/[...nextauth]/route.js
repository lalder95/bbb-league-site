// src/app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

console.log("Initializing NextAuth with Development Bypass Provider");
console.log("Current environment:", process.env.NODE_ENV);

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
          console.log("Authorize called with credentials for username:", credentials?.username);
          
          if (!credentials?.username) {
            console.error("Missing username");
            return null;
          }
          
          // Known user list for development - add any users you need here
          const devUsers = [
            {
              "id": "1",
              "username": "lalder",
              "email": "lalder95@gmail.com",
              "password": "12345",
              "role": "admin",
              "passwordChangeRequired": false,
              "createdAt": "2025-03-23T11:08:00.000Z",
              "sleeperId": "456973480269705216",
              "lastLogin": "2025-03-23T22:05:43.216Z",
              "passwordLastChanged": "2025-03-26T18:24:14.980Z"
            },
            {
              "id": "2",
              "username": "aintEZBNwheezE",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:44:44.438Z",
              "sleeperId": "913497379737829376",
              "lastLogin": null
            },
            {
              "id": "3",
              "username": "Chewy2552",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:44:53.897Z",
              "sleeperId": "756760079197458432",
              "lastLogin": null
            },
            {
              "id": "4",
              "username": "Delusional1",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:45:01.263Z",
              "sleeperId": "696154532161347584",
              "lastLogin": null
            },
            {
              "id": "5",
              "username": "DylanBears2022",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:45:06.734Z",
              "sleeperId": "820806976639475712",
              "lastLogin": null
            },
            {
              "id": "6",
              "username": "EthanL21",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:45:12.173Z",
              "sleeperId": "885739177386393600",
              "lastLogin": null
            },
            {
              "id": "7",
              "username": "Henrypavlak3",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:45:17.293Z",
              "sleeperId": "885724639740096512",
              "lastLogin": null
            },
            {
              "id": "8",
              "username": "jwalwer81",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:45:22.318Z",
              "sleeperId": "672674056419475456",
              "lastLogin": null
            },
            {
              "id": "9",
              "username": "mlthomas5095",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:45:28.337Z",
              "sleeperId": "717639328456572928",
              "lastLogin": null
            },
            {
              "id": "10",
              "username": "Schoontang",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:45:32.601Z",
              "sleeperId": "600829464699531264",
              "lastLogin": null
            },
            {
              "id": "11",
              "username": "tylercrain",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:45:37.273Z",
              "sleeperId": "608494374518607872",
              "lastLogin": null
            },
            {
              "id": "12",
              "username": "Vikingsfan80",
              "email": "",
              "password": "12345",
              "role": "user",
              "passwordChangeRequired": true,
              "createdAt": "2025-03-23T20:45:42.055Z",
              "sleeperId": "820483197975519232",
              "lastLogin": null
            },
            // Add more users as needed
          ];
          
          // Find matching user
          const user = devUsers.find(u => 
            u.username.toLowerCase() === credentials.username.toLowerCase()
          );
          
          if (!user) {
            console.error(`User not found: ${credentials.username}`);
            return null;
          }
          
          console.log(`⚠️ DEVELOPMENT MODE: Bypassing password check for user: ${user.username}`);
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
      session.user.id = token.id || token.sub;
      session.user.role = token.role;
      session.user.passwordChangeRequired = token.passwordChangeRequired;
      session.user.sleeperId = token.sleeperId;
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.passwordChangeRequired = user.passwordChangeRequired;
        token.sleeperId = user.sleeperId;
      }
      return token;
    },
  },
  debug: true, // Enable debug mode to see all logs
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };