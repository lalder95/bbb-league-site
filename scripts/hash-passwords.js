const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

async function hashPasswords() {
  console.log('Starting password hashing process...');
  
  try {
    // Path to users.json
    const usersFilePath = path.join(process.cwd(), 'src/data/users.json');
    console.log(`Looking for users.json at: ${usersFilePath}`);
    
    // Check if file exists
    if (!fs.existsSync(usersFilePath)) {
      console.error(`ERROR: File not found at ${usersFilePath}`);
      return;
    }
    
    // Read users from file
    console.log('Reading users.json file...');
    const usersData = fs.readFileSync(usersFilePath, 'utf8');
    
    try {
      const users = JSON.parse(usersData);
      console.log(`Found ${users.length} users in the file`);
      
      // Hash passwords for all users that don't already have hashed passwords
      const saltRounds = 10;
      let hashedCount = 0;
      
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        console.log(`Processing user: ${user.username || 'unknown'}`);
        
        // Skip already hashed passwords (they start with $2)
        if (user.password && !user.password.startsWith('$2')) {
          console.log(`  Hashing password for user: ${user.username || 'unknown'}`);
          users[i].password = await bcrypt.hash(user.password, saltRounds);
          hashedCount++;
        } else {
          console.log(`  Password already hashed or not present for user: ${user.username || 'unknown'}`);
        }
      }
      
      // Write back to file
      console.log('Writing updated passwords back to file...');
      fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
      
      console.log(`Hashing complete! ${hashedCount} passwords were hashed.`);
    } catch (jsonError) {
      console.error('ERROR: Failed to parse users.json. The file might be empty or contain invalid JSON.');
      console.error(jsonError);
    }
  } catch (error) {
    console.error('ERROR in password hashing process:');
    console.error(error);
  }
}

// Run the function
console.log('Password hashing script started');
hashPasswords().then(() => {
  console.log('Script finished executing');
}).catch(err => {
  console.error('Unhandled error in script execution:');
  console.error(err);
});