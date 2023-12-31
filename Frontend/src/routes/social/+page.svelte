<script lang="ts">

	import { notification } from '../../stores/notificationStore.js';
	import { user } from '../../stores/user';
	import io from 'socket.io-client';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import pendingIcon from '../../lib/images/pending.png';
	import friendsIcon from '../../lib/images/friends.png';

	const apiUrl = import.meta.env.VITE_API_URL;
	const serverIP = import.meta.env.VITE_SERVER_IP;

	let pendingRequests : any = [];
	let friends : any = [];
	let requesteeLogin: string;
	let friendRequestModalOpen = false;
	let requesteeLoginModal = '';
	let socket: any;
	let myCookie: String | undefined = '';
	let login: string;
	let requesteeId : number;
	let id_user : number; 

	onMount(async () => {
		function getCookie(name: string) {
			const value = `; ${document.cookie}`;
			const parts = value.split(`; ${name}=`);
			if (parts.length === 2) {
				return parts.pop()?.split(';').shift();
			}
		}
		myCookie = getCookie('jwt');
		if (!myCookie)
			goto('/')
		else
		{
			async function getUserinfo() {
				try {
					const response = await fetch('http://' + serverIP + ':3333/profil/me', {
						method: 'GET',
						headers: {
							'Content-Type': 'application/json',
							Authorization: 'Bearer ' + myCookie
						},
						credentials: 'include'
					});
					const data = await response.json();
					if (data) {
						login = data.login;
						id_user = data.id
					}
				} catch (error) {
					console.error('An error occurred while fetching user info:', error);
				}
			}
			await getUserinfo()
			socket = io('http://' + serverIP + ':3333', {
				transports: ['websocket'],
				auth: {
					token: myCookie
				}
			});
			socket.on('connect', () => {
				console.log('connected');
			});
			socket.on('disconnect', () => {
				console.log('disconnected');
			});
			socket.on('friend-request', (data: {
				login: number, other: number
			}) => {
				// console.log(data.login)
				// console.log(data.other)
				if (data.login == id_user || data.other == id_user)
					refreshData();
			});
		}
		await refreshData()
	});

	async function getId(id_friend : number)
	{
		try 
		{
		const res = await fetch(`${apiUrl}/social/friend/${id_friend}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer ' + myCookie,
				},
			});
			const result = await res.json();
			return { requesterId: result.requesterId, requesteeId: result.requesteeId }
		if (result.status === 'error') {
				notification.set({
					message: result.message,
					error: true
				});
		}
		}
		catch(error) {
			console.log(error)
		}
		
	}

	async function refreshData() {
		try {
			if (!login)
				return;
			pendingRequests = await getFriendRequests(login);
			friends = await getFriendList(login);
		} catch (error) {
			notification.set({
				message: 'An error occurred while fetching data',
				error: true
			});
		}
	}

	async function getFriendRequests(userLogin: string) {
		try {
			// console.log(myCookie);
			const res = await fetch(`${apiUrl}/social/friend-requests/${userLogin}`, {
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer ' + myCookie,
				},
			});
			const result = await res.json();

			if (result.status === 'error') {
				notification.set({
					message: result.message,
					error: true
				});
				return [];
			}
			return result;

		} catch (error) {
			alert('Error: Failed to fetch friend requests');
		}
	}

	async function acceptFriendRequest(id : any) {
		try {
			const res = await fetch(`${apiUrl}/social/friend-request/${id}/accept`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer ' + myCookie,
				},
			});
			const result = await res.json();

			if (result.status === 'error') {
				notification.set({
					message: result.message,
					error: true
				});
			} else {
				let data = await getId(id)
				socket.emit("newFriendRequest", {
					login: data.requesteeId,
					other: data.requesterId,
				});
				await refreshData()
			}

		} catch (error) {
			notification.set({
				message: 'An error occurred while accepting the friend request',
				error: true
			});
		}
	}

	async function rejectFriendRequest(id : any) {
		try {
			const res = await fetch(`${apiUrl}/social/friend/${id}`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer ' + myCookie,
				},
			});
			const result = await res.json();

			if (result.status === 'error') {
				notification.set({
					message: result.message,
					error: true
				});
			} else {
				await refreshData()
			}

		} catch (error) {
			notification.set({
				message: 'An error occurred while rejecting the friend request',
				error: true
			});
		}
	}

	async function getFriendList(userLogin: string) {
		try {
			const res = await fetch(`${apiUrl}/social/friend-list/${login}`, {
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer ' + myCookie,
				},
			});
			const result = await res.json();

			if (result.status === 'error') {
				notification.set({
					message: result.message,
					error: true
				});
				return [];
			}
			return result;

		} catch (error) {
			alert('Error: Failed to fetch friend list');
		}
	}

	async function sendFriendRequest() {
		try {
			const res = await fetch(`${apiUrl}/social/friend-request`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer ' + myCookie,
				},
				body: JSON.stringify({
					requesterLogin: login,
					requesteeLogin
				})
			});

			const result = await res.json();
			if (result.status === 'error') {
				notification.set({
					message: result.message,
					error: true
				});
			} else {
				notification.set({
					message: 'Friend request sent successfully!',
					error: false
				});
				
				socket.emit("newFriendRequest", {
					login: result.data.requesteeId
				})
				await refreshData()
			}

		} catch (error) {
			console.log(error)
			notification.set({
				message: 'An error occurred while sending the friend request',
				error: true
			});
		} finally {
			setTimeout(() => {
				notification.set({
					message: '',
					error: false
				});
			}, 5000);
		}
	}

	async function deleteFriend(id : any) {
		let data = await getId(id);
		try {
			const res = await fetch(`${apiUrl}/social/friend/${id}`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer ' + myCookie,
				},
			});
			const result = await res.json();

			if (result.status === 'error') {
				notification.set({
					message: result.message,
					error: true
				});
			} else {
				socket.emit("newFriendRequest", {
					login: data.requesteeId,
					other : data.requesterId,
				});
				await refreshData();
			}

		} catch (error) {
			notification.set({
				message: 'An error occurred while deleting the friend',
				error: true
			});
		}
	}

	function openFriendRequestModal() {
		friendRequestModalOpen = true;
	}

	function closeFriendRequestModal() {
		friendRequestModalOpen = false;
		requesteeLoginModal = "";
	}

	async function sendFriendRequestModal() {
		if (!requesteeLoginModal || requesteeLoginModal.trim() === '') {
			notification.set({
				message: 'Please type in a valid user login',
				error: true
			});
			setTimeout(() => {
				notification.set({
					message: '',
					error: false
				});
			}, 5000);
			return;
		}
		requesteeLogin = requesteeLoginModal;
		await sendFriendRequest();
		closeFriendRequestModal();
	}
	</script>

{#if myCookie}
<section class="actions">
	<button id="send_friend_request" class="button-styled" on:click={openFriendRequestModal}
		>Send a friend request</button
	>
	{#if friendRequestModalOpen}
		<div class="modal">
			<div class="modal-content">
				<h3>Friend request</h3>
				<input type="text" name=text id=text_receiver bind:value={requesteeLoginModal} placeholder="Friend's user login" />
				<br /> <br />
				<button class="greenButton" on:click={sendFriendRequestModal}>Send</button>
				<button class="redButton" on:click={closeFriendRequestModal}>Cancel</button>
			</div>
		</div>
	{/if}

	{#if $notification.message}
		<!-- Display the notification message if it exists -->
		<p class={$notification.error ? 'notification-error' : 'notification-success'}>
			{$notification.message}
		</p>
	{/if}
</section>

<section>
	{#if pendingRequests.length > 0}
		<div class="white-frame">
			<h2 class="section-heading"><img src="{pendingIcon}" alt="Pending Requests"/> Pending Friend Requests</h2>
			<div class="friends-container">
				{#each pendingRequests as request (request.id)}
					<div class="friend-card">
						<img
							src={request.requester.avatar
								? request.requester.avatar
								: request.requester.small_pic}
							alt="{request.requester.login}'s picture"
							class="friend-image"
						/>
						<h3 class="friend-name">{request.requester.login}</h3>
						<button class="button-accept" on:click={() => acceptFriendRequest(request.id)}
							>Accept</button
						>
						<button class="button-cancel" on:click={() => rejectFriendRequest(request.id)}
							>Reject</button
						>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>

<section>
	<div class="white-frame">
		<h2 class="section-heading"><img src="{friendsIcon}" alt="Friends"/> Friends</h2>
		<div class="friends-container">
			{#each friends as friend (friend.id)}
				<div class="friend-card">
					<img
						src={friend.friend.avatar ? friend.friend.avatar : friend.friend.small_pic}
						alt="{friend.friend.login}'s picture"
						class="friend-image"
					/>
					<h3 class="friend-name">{friend.friend.login}</h3>
					<p class="status">
						<span class={`status-circle ${friend.friend.status}`} />
						{friend.friend.status === 'login'
							? 'Connected'
							: friend.friend.status === 'logout'
							? 'Disconnected'
							: 'In Game'}
					</p>
					<a
						href={`/profile/info/?login=${friend.friend.login}`}
						id="view-friend-profile"
						class="button-style-light">View Profile</a
					>
					<button id="delete-friend" class="button-cancel" on:click={() => deleteFriend(friend.id)}
						>Delete Friend</button
					>
				</div>
			{/each}
		</div>
	</div>
</section>
{/if}


<style>
	.section-heading {
		font-weight: bold;
		font-size: 20px;
	}

	.modal {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.modal-content {
		background: linear-gradient(to bottom, #4bc3ff, #2b0bbc);
		padding: 1.5rem;
		border-radius: 15px;
		text-align: center;
		font-weight: bold;
		border-radius: 15px;
	}

	.modal-content h3 {
		margin-top: 0;
		margin-bottom: 10px;
		font-size: 2em;
	}

	/* Friend Cards */
	.friends-container {
		display: flex;
		flex-wrap: nowrap;
		overflow-x: auto;
		justify-content: flex-start;
		gap: 10px;
	}

	.friend-card {
		position: relative;
		flex: 0 0 auto;
		width: 120px;
		border: 1px solid #ccc;
		border-radius: 10px;
		margin: 10px;
		padding: 10px;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	/* Delete Friend Button */
	.delete-button {
		width: 105px;
		font-size: 1rem;
		margin-top: 5px;
		padding: 2px 2px;
		border: none;
		border-radius: 5px;
		color: #fff;
		cursor: pointer;
		background-color: #f44336;
	}

	.delete-button:hover {
		background-color: #da190b;
		text-decoration: none;
	}

	.friend-image {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		object-fit: cover;
	}

	.friend-name {
		margin: 5px 0;
	}

	/* Status */
	.status {
		display: flex;
		align-items: center;
		gap: 5px;
		margin: 3px 0;
	}

	.status-circle {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	@keyframes blink {
		0% {
			opacity: 1;
		}

		50% {
			opacity: 0;
		}

		100% {
			opacity: 1;
		}
	}

	.status-circle.login {
		background-color: #4caf50;
	}

	.status-circle.logout {
		background-color: #f44336;
	}

	.status-circle.ingame {
		background-color: yellow;
		animation: blink 1s infinite;
	}

	#send_friend_request {
		width: auto;
		margin-top: 1em;
		margin-bottom: 1em;
	}

	#view-friend-profile,
	#delete-friend {
		width: 120px;
	}

	button {
		margin-top: 5px;
		padding: 0.5rem 0.5rem;
		width: 90px;
	}

	/* Errors Friend Requests */
	.notification-error {
		font-size: 1.2rem;
		color: red;
		font-weight: bold;
	}

	.notification-success {
		font-size: 1.2rem;
		color: rgb(0, 255, 0);
		font-weight: bold;
	}

	/* White Frame Sections */
	.white-frame {
		border: 2px solid #fff;
		padding: 15px;
		border-radius: 10px;
		min-height: 50px;
		margin: 10px 0;
		padding-top: 1px;
	}

	.section-heading {
		display: flex;
		align-items: center;
		gap: 7px;
		font-weight: bold;
		font-size: 19px;
		text-align: left;
		padding-bottom: 10px;
		border-bottom: 1px solid #ddd;
	}

	.section-heading img {
		width: 50px;
		height: 50px;
	}

	.friend-card {
		margin: 5px;
	}

	/* Notifications Location */
	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.notification-error,
	.notification-success {
		margin: 0;
	}
</style>
