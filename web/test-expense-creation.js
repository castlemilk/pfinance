// Manual test script to verify expense creation
// Run this in the browser console

// Test 1: Check if localStorage is working
console.log('=== Test 1: localStorage Check ===');
console.log('Current expenses:', localStorage.getItem('expenses'));

// Test 2: Try to create a personal expense via the UI
console.log('\n=== Test 2: Personal Expense Creation ===');
console.log('1. Navigate to /personal/expenses');
console.log('2. Fill in the expense form');
console.log('3. Click "Add Expense"');
console.log('4. Check localStorage again');

// Test 3: Check for CORS errors
console.log('\n=== Test 3: API Connection Check ===');
fetch('http://localhost:8111/health')
  .then(res => {
    console.log('Backend health check:', res.status === 200 ? 'OK' : 'Failed');
  })
  .catch(err => {
    console.error('Backend connection error:', err);
  });

// Test 4: Check Firebase auth status
console.log('\n=== Test 4: Firebase Auth Check ===');
import('./src/lib/firebase').then(({ auth }) => {
  console.log('Firebase auth initialized:', !!auth);
  console.log('Current user:', auth?.currentUser?.email || 'Not signed in');
}).catch(err => {
  console.error('Firebase initialization error:', err);
});

// Test 5: Monitor network requests
console.log('\n=== Test 5: Network Request Monitor ===');
console.log('Open Network tab and watch for any failed requests when creating an expense');