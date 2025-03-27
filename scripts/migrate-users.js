// scripts/migrate-users.js
// require('dotenv').config({ path: '.env.local' }); // Comment out this line
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function main() {
  // Hardcode the connection string instead of reading from environment
  const uri = "mongodb+srv://lalder:DZD2xEfDYqDJSKt5@cluster0.srnwfpv.mongodb.net/bbb-league?retryWrites=true&w=majority";
  
  // Comment out this check since we're hardcoding the URI
  // if (!uri) {
  //   console.error('MONGODB_URI not found in environment variables');
  //   process.exit(1);
  // }

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
    
    // Insert users
    const result = await usersCollection.insertMany(users);
    console.log(`Successfully inserted ${result.insertedCount} users into MongoDB`);
    
    // Verify users can be fetched
    console.log('\nVerifying users can be fetched from MongoDB:');
    
    if (users.length > 0) {
      const testUsername = users[0].username;
      console.log(`Looking up test user '${testUsername}'...`);
      
      // Case sensitive lookup
      const exactUser = await usersCollection.findOne({ username: testUsername });
      console.log(`Exact match lookup: ${exactUser ? 'Found' : 'Not found'}`);
      
      // Case insensitive lookup
      const caseInsensitiveUser = await usersCollection.findOne({
        username: { $regex: new RegExp('^' + testUsername + '$', 'i') }
      });
      console.log(`Case-insensitive lookup: ${caseInsensitiveUser ? 'Found' : 'Not found'}`);
      
      if (caseInsensitiveUser) {
        console.log('Sample user field names:', Object.keys(caseInsensitiveUser));
      }
    }
    
    console.log('\nMigration complete! Your users have been copied to MongoDB.');
    console.log('Make sure your environment variables are set correctly in your deployment.');
    
  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

main().catch(console.error);