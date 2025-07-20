import { FS5 } from "../../../src/fs/fs5.js";
import { setupMockS5 } from "../../test-utils.js";

async function testSetup() {
  const { s5, identity } = await setupMockS5();
  const fs = new FS5(s5, identity as any);
  
  console.log("1. Initializing identity...");
  await fs.ensureIdentityInitialized();
  
  // Add delay to ensure registry operations complete
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log("2. Checking if home exists...");
  try {
    const metadata = await fs.getMetadata('home');
    console.log("Home metadata:", metadata);
  } catch (error) {
    console.error("Error getting home metadata:", error);
    
    // Try creating it manually
    console.log("3. Creating home directory manually...");
    try {
      await fs.createDirectory('home');
      console.log("Home directory created successfully");
    } catch (err) {
      console.error("Error creating home directory:", err);
    }
  }
  
  console.log("4. Creating test file...");
  try {
    await fs.put('home/test.txt', 'hello world');
    console.log("Success! File created");
  } catch (error) {
    console.error("Error creating file:", error);
  }
  
  console.log("5. Listing home directory...");
  try {
    const items = [];
    for await (const item of fs.list('home')) {
      items.push(item);
    }
    console.log("Found items:", items);
  } catch (error) {
    console.error("Error listing directory:", error);
  }
}

testSetup().catch(console.error);