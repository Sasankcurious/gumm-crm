// ==========================================
// 1. LOGIN LOGIC
// ==========================================
const loginForm = document.getElementById('loginForm');

if (loginForm) {
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (res.ok) {
                // Save Token & Redirect
                localStorage.setItem('token', data.token);
                localStorage.setItem('companyName', data.companyName);
                window.location.href = '/dashboard.html';
            } else {
                alert(data.error || "Login failed");
            }
        } catch (err) {
            console.error(err);
            alert("Server connection failed. Is the node server running?");
        }
    };
}

// ==========================================
// 2. REGISTER LOGIC
// ==========================================
const registerForm = document.getElementById('registerForm');

if (registerForm) {
    registerForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const companyName = document.getElementById('companyName').value;
        // Note: Make sure your HTML inputs use these exact IDs: 'regEmail' and 'regPassword'
        const email = document.getElementById('regEmail').value; 
        const password = document.getElementById('regPassword').value;

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyName, email, password })
            });

            const data = await res.json();
            
            if (res.ok) {
                // SUCCESS: No alert, just move to login page
                window.location.href = '/login.html'; 
            } else {
                // ERROR: Show alert so user knows what went wrong
                alert(data.error || "Registration failed"); 
            }
        } catch (err) {
            console.error(err);
            alert("Server connection failed. Is the node server running?");
        }
    };
}