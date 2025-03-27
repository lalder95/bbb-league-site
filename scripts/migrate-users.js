// scripts/migrate-users.js
// const { MongoClient } = require('mongodb');
const MongoClient = require('mongodb').MongoClient;
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function main() {
  // HARDCODED CONNECTION STRING - replace with your actual connection string
  const uri = "mongodb+srv://lalder:DZD2xEfDYqDJSKt5@cluster0.srnwfpv.mongodb.net/bbb-league?retryWrites=true&w=majority";
  
  console.log('Using hardcoded connection string');
  console.log('Connecting to MongoDB...');
  
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected successfully to MongoDB');
    
    const db = client.db('bbb-league');
    const usersCollection = db.collection('users');
    
    // Read local users.json
    console.log('Reading users.json file...');
    const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
    const usersData = fs.readFileSync(usersFilePath, 'utf8');
    const users = JSON.parse(usersData);
    
    console.log(`Found ${users.length} users in users.json`);

    // Check existing users in MongoDB
    const existingCount = await usersCollection.countDocuments();
    console.log(`Found ${existingCount} existing users in MongoDB`);
    
    if (existingCount > 0) {
      console.log('⚠️ WARNING: Collection already has users. Do you want to replace them? (y/n)');
      const answer = await new Promise(resolve => {
        process.stdin.once('data', data => {
          resolve(data.toString().trim().toLowerCase());
        });
      });
      
      if (answer !== 'y') {
        console.log('Operation cancelled by user');
        return;
      }
      
      // Delete existing users
      await usersCollection.deleteMany({});
      console.log('Deleted existing users');
    }
    
    // Hash passwords and prepare users for insertion
    console.log('Hashing passwords for all users...');
    const saltRounds = 10;
    
    const hashedUsers = await Promise.all(users.map(async (user) => {
      // Check if password is already hashed (bcrypt hashes start with $2)
      if (user.password && !user.password.startsWith('$2')) {
        console.log(`Hashing password for user: ${user.username}`);
        user.password = await bcrypt.hash(user.password, saltRounds);
      }
      return user;
    }));
    
    // Insert users with hashed passwords
    const result = await usersCollection.insertMany(hashedUsers);
    console.log(`Successfully inserted ${result.insertedCount} users with hashed passwords into MongoDB`);
    
    // Verify users can be fetched
    console.log('\nVerifying users can be fetched from MongoDB:');
    
    if (users.length > 0) {
      const testUsername = users[0].username;
      console.log(`Looking up test user '${testUsername}'...`);
      
      // Case insensitive lookup
      const user = await usersCollection.findOne({
        username: { $regex: new RegExp('^' + testUsername + '$', 'i') }
      });
      
      if (user) {
        console.log('User found successfully:');
        console.log('Username:', user.username);
        console.log('Password is hashed:', user.password.startsWith('$2'));
        console.log('Field names:', Object.keys(user));
      } else {
        console.log(`❌ User '${testUsername}' not found! This is unexpected.`);
      }
    }
    
    console.log('\nMigration complete! Your users have been copied to MongoDB with hashed passwords.');
    console.log('Make sure your environment variables are set correctly in your deployment.');
    
  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

main().catch(console.error);