document.addEventListener('DOMContentLoaded', () => {
	const field = document.getElementById('riceField');
	const startButton = document.getElementById('startGameBtn');
	const scoreElement = document.getElementById('gameScore');
	const timeElement = document.getElementById('gameTime');
	const message = document.getElementById('gameMsg');
	let score = 0;
	let timeLeft = 60;
	let timerId;

	function placeGrain() {
		const grain = document.createElement('button');
		grain.className = 'rice-grain';
		grain.type = 'button';
		grain.textContent = '🌾';
		grain.style.left = `${Math.random() * 88 + 4}%`;
		grain.style.top = `${Math.random() * 78 + 4}%`;
		grain.addEventListener('click', () => {
			score += 10;
			scoreElement.textContent = score;
			grain.remove();
			placeGrain();
		});
		field.appendChild(grain);
	}

	function endGame() {
		clearInterval(timerId);
		field.replaceChildren();
		startButton.disabled = false;
		startButton.textContent = '再玩一次';
		message.textContent = `時間到！你收集了 ${score} 分。`;
	}

	function startGame() {
		clearInterval(timerId);
		score = 0;
		timeLeft = 60;
		scoreElement.textContent = score;
		timeElement.textContent = timeLeft;
		startButton.disabled = true;
		startButton.textContent = '遊戲中';
		message.textContent = '快點擊稻穗！';
		field.replaceChildren();
		for (let index = 0; index < 8; index += 1) {
			placeGrain();
		}
		timerId = setInterval(() => {
			timeLeft -= 1;
			timeElement.textContent = timeLeft;
			if (timeLeft <= 0) endGame();
		}, 1000);
	}

	if (startButton && field) startButton.addEventListener('click', startGame);
});
