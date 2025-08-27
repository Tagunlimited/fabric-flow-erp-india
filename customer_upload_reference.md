# Customer Bulk Upload Reference

## CSV Format
The CSV file should have the following columns in order:

1. **Company Name** (required)
2. **GSTIN** (optional)
3. **Mobile** (required, min 10 digits)
4. **Email** (required, valid format)
5. **Customer Type ID** (required, must be valid ID)
6. **Address** (required)
7. **City** (required)
8. **State ID** (required, must be valid ID)
9. **Pincode** (required, exactly 6 digits)
10. **Loyalty Points** (optional, default 0)

## Valid Customer Type IDs
| ID | Type | Description |
|----|------|-------------|
| 1 | Wholesale | Wholesale customers (15% discount) |
| 2 | Retail | Retail customers (5% discount) |
| 3 | Ecommerce | Online platform customers (10% discount) |
| 4 | Staff | Company staff purchases (25% discount) |

## Valid State IDs
| ID | State | Code | Major Cities |
|----|-------|------|--------------|
| 1 | Andhra Pradesh | AP | Visakhapatnam, Vijayawada |
| 2 | Arunachal Pradesh | AR | Itanagar |
| 3 | Assam | AS | Guwahati |
| 4 | Bihar | BR | Patna |
| 5 | Chhattisgarh | CG | Raipur |
| 6 | Delhi | DL | New Delhi |
| 7 | Goa | GA | Panaji |
| 8 | Gujarat | GJ | Ahmedabad, Surat |
| 9 | Haryana | HR | Gurgaon, Chandigarh |
| 10 | Himachal Pradesh | HP | Shimla |
| 11 | Jharkhand | JH | Ranchi |
| 12 | Karnataka | KA | Bangalore, Mysore |
| 13 | Kerala | KL | Kochi, Trivandrum |
| 14 | Madhya Pradesh | MP | Bhopal, Indore |
| 15 | Maharashtra | MH | Mumbai, Pune, Nagpur |
| 16 | Manipur | MN | Imphal |
| 17 | Meghalaya | ML | Shillong |
| 18 | Mizoram | MZ | Aizawl |
| 19 | Nagaland | NL | Kohima |
| 20 | Odisha | OR | Bhubaneswar |
| 21 | Punjab | PB | Chandigarh, Ludhiana |
| 22 | Rajasthan | RJ | Jaipur, Jodhpur |
| 23 | Sikkim | SK | Gangtok |
| 24 | Tamil Nadu | TN | Chennai, Coimbatore |
| 25 | Telangana | TS | Hyderabad |
| 26 | Tripura | TR | Agartala |
| 27 | Uttar Pradesh | UP | Lucknow, Kanpur |
| 28 | Uttarakhand | UK | Dehradun |
| 29 | West Bengal | WB | Kolkata, Howrah |

## Example CSV Content
```csv
Company Name,GSTIN,Mobile,Email,Customer Type ID,Address,City,State ID,Pincode,Loyalty Points
ABC Textiles,GSTIN123456789,9876543210,contact@abctextiles.com,1,123 Industrial Area,Mumbai,15,400001,0
XYZ Garments,GSTIN987654321,9876543211,info@xyzgarments.com,2,456 Main Street,Delhi,6,110001,0
Fashion Hub,GSTIN456789123,9876543212,sales@fashionhub.com,3,789 Commercial Plaza,Bangalore,12,560001,0
```

## Validation Rules
- **Company Name**: Required, cannot be empty
- **Mobile**: Must be at least 10 digits
- **Email**: Must be valid email format (e.g., user@domain.com)
- **Customer Type ID**: Must be 1, 2, 3, or 4
- **State ID**: Must be a valid state ID from the table above
- **Pincode**: Must be exactly 6 digits
- **GSTIN**: Optional but recommended for business customers
- **Loyalty Points**: Optional, defaults to 0

## Common Errors and Solutions
1. **"Invalid Customer Type ID"**: Use only 1, 2, 3, or 4
2. **"Invalid State ID"**: Use valid state IDs from the table above
3. **"Mobile number must be at least 10 digits"**: Ensure mobile has 10+ digits
4. **"Invalid email format"**: Use proper email format (user@domain.com)
5. **"Pincode must be exactly 6 digits"**: Ensure pincode is exactly 6 digits

## Testing
Use the provided `test_customer_upload.csv` file to test the upload functionality before uploading your actual data.
