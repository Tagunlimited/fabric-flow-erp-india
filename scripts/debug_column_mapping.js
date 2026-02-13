// Debug script to test column mapping
// This will help us understand the exact column structure

// Expected column structure:
// 0: Company Name
// 1: GSTIN  
// 2: Mobile
// 3: Email
// 4: Customer Type
// 5: Address
// 6: City
// 7: State
// 8: Pincode
// 9: Loyalty Points

// Test data based on your Excel
const testRow = [
  "Alpha Traders",           // 0: Company Name
  "27ABCDE0000F1Z0",        // 1: GSTIN
  "9346247722",             // 2: Mobile
  "alphatraders@gmail.com", // 3: Email
  "Wholesale",              // 4: Customer Type
  "180, Station Road",      // 5: Address
  "Mumbai",                 // 6: City
  "Maharashtra",            // 7: State
  "695200",                 // 8: Pincode
  "595"                     // 9: Loyalty Points
];

console.log("Column Mapping Test:");
console.log("Column 0 (Company):", testRow[0]);
console.log("Column 1 (GSTIN):", testRow[1]);
console.log("Column 2 (Mobile):", testRow[2]);
console.log("Column 3 (Email):", testRow[3]);
console.log("Column 4 (Customer Type):", testRow[4]);
console.log("Column 5 (Address):", testRow[5]);
console.log("Column 6 (City):", testRow[6]);
console.log("Column 7 (State):", testRow[7]);
console.log("Column 8 (Pincode):", testRow[8]);
console.log("Column 9 (Loyalty):", testRow[9]);

console.log("\nExpected values:");
console.log("Customer Type (col 4):", testRow[4]?.toLowerCase());
console.log("State (col 7):", testRow[7]?.toLowerCase());

console.log("\nIf you see 'Mumbai' in State column, there's a mapping issue!");
