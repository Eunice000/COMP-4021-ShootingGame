        // Show login when start image is clicked
        (function () {
            const startBtn = document.getElementById('startBtn');
            const startGameWrap = document.querySelector('.start-game');
            const login = document.querySelector('.login-container');

            

            if (!login) return;

            // hide login initially
            login.classList.add('login-hidden');

                function showLogin() {
                    if (startGameWrap) {
                        startGameWrap.classList.add('hidden');
                         startGameWrap.style.display = 'none';
                    }

                    login.classList.remove('login-hidden');
                    requestAnimationFrame(() => login.classList.add('login-visible'));
                    const firstInput = login.querySelector('input');
                    if (firstInput) firstInput.focus();
                }

                startBtn.addEventListener('click', showLogin);
                startGameWrap.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        showLogin();
                    }
                });

                
            })();
