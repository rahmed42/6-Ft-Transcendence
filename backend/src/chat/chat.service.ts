import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatDtoAdminOperation, ChatDtoBlockUser, ChatDtoCreateMessage, ChatDtoCreateRoom, ChatDtoGetRoom, ChatDtoJoinRoom, PrivateChatDtoCreateMessage, PrivateChatDtoCreateRoom } from './dto';
import * as argon from 'argon2';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ChatService {
    constructor(private prisma: PrismaService) { }

    async createRoom(body: ChatDtoCreateRoom) {
        const roomExists = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
        });
        if (roomExists) {
            return({ message :  'Room already exists' });
        }
        if (body.type != "public" && body.type != "private" && body.type != "protected") {
            return({ message :  'Invalid room type' });
        }
        if (body.type == "protected" && !body.password) {
            return({ message :  'Password required for protected room' });
        }
        const user = await this.prisma.user.findFirst({
            where: {
                id: body.idUser,
            },
        });
        if (!user) {
            return({ message :  'User does not exist' });
        }
        if (!body.password) {
            body.password = '';
        }
        const hash = await argon.hash(body.password);
        const room = await this.prisma.room.create({
            data: {
                name: body.roomName,
                password: hash,
                type: body.type,
                messages: {},
                users: {
                    connect: {
                        id: body.idUser,
                    }
                },
				ownerId : body.idUser,
                invitedUsers: {
                    connect: {
                        id: body.idUser,
                    }
                },
                administrators: {
                    connect: {
                        id: body.idUser,
                    }
                },
                bannedUsers: {},
                mutedUsers: {},
            },
        });
        delete room.password;
        return { room: room }
    }



    async joinRoom(body: ChatDtoJoinRoom) {
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            }
        });
        const user = await this.prisma.user.findFirst({
            where: {
                id: body.idUser,
            }
        })
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        if (!user) {
            return({ message :  'User does not exist' });
        }
        if (room.type == "protected" && !body.password) {
            return({ message :  'Password required for protected room' });
        }
        // select invitedUsers from room where id = body.idRoom
        let invited = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                invitedUsers: {
                    some: {
                        id: body.idUser,
                    }
                },
            },
        });
        if (!invited && room.type == "private") {
            return({ message :  'User not invited to private room' });
        }
        if (room.type == "protected") {
            let pwMatches = await argon.verify(room.password, body.password);
            if (!pwMatches) {
                return({ message :  'Invalid password' });
            }
        }
        const userInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        id: body.idUser,
                    }
                },
            },
        });
        const isBan = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                bannedUsers: {
                    some: {
                        id: body.idUser,
                    }
                },
            },
        });
        if (userInRoom) {
            return({ message :  'User already in room' });
        }
        if (isBan) {
            return({ message :  'User is banned from room' });
        }
        await this.prisma.user.update({
            where: {
                id: body.idUser,
            },
            data: {
                rooms: {
                    connect: {
                        name: body.roomName,
                    },
                },
                invitedRooms: {
                    connect: {
                        name: body.roomName,
                    },
                },
            },
        });
        const updatedRoom = await this.prisma.room.update({
            where: {
                name: body.roomName,
            },
            data: {
                users: {
                    connect: {
                        id: body.idUser,
                    },
                },
            },
        });
        delete updatedRoom.password;
        // select users table
        const users = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
            select: {
                users: true,
            },
        });
        const messages = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
            select: {
                messages: true,
            },
        });
        return { room: updatedRoom, users: users.users, messages: messages.messages };
    }

    async inviteUser(body: ChatDtoAdminOperation) {
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            }
        });
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        const admin = await this.prisma.user.findFirst({
            where: {
                id: body.idAdmin,
            }
        });
        if (!admin) {
            return({ message :  'User does not exist' });
        }
        const toInvite = await this.prisma.user.findFirst({
            where: {
                login: body.loginUserToExecute,
            }
        });
        if (!toInvite) {
            return({ message :  'User to invite does not exist' });
        }
        const isAdmin = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                administrators: {
                    some: {
                        id: body.idAdmin,
                    }
                },
            },
        });
        if (!isAdmin) {
            return({ message :  'User is not admin' });
        }
        const isUserInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        login: body.loginUserToExecute,
                    }
                }
            },
        });
        if (isUserInRoom) {
            return({ message :  'User already in room' });
        }
		const isUserAlreadyInvited = await this.prisma.room.findFirst({
			where: {
				name: body.roomName,
				invitedUsers: {
					some: {
						login: body.loginUserToExecute,
					}
				}
			}
		});
		if (isUserAlreadyInvited) {
			return({ message :  'User already invited' });
		}
        const updatedRoom = await this.prisma.room.update({
            where: {
                name: body.roomName,
            },
            data: {
                invitedUsers: {
                    connect: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        const updatedUser = await this.prisma.user.update({
            where: {
                login: body.loginUserToExecute,
            },
            data: {
                invitedRooms: {
                    connect: {
                        name: body.roomName,
                    },
                },
            },
        });
        return { success: "User successfully invited" }
    }
    async kickUser(body: ChatDtoAdminOperation) {
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
        });
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        const admin = await this.prisma.user.findFirst({
            where: {
                id: body.idAdmin,
            },
        });
        if (!admin) {
            return({ message :  'User does not exist' });
        }
        const toKick = await this.prisma.user.findFirst({
            where: {
                login: body.loginUserToExecute,
            },
        });
        if (!toKick) {
            return({ message :  'User to kick does not exist' });
        }
        const isAdmin = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                administrators: {
                    some: {
                        id: body.idAdmin,
                    },
                },
            },
        });
        if (!isAdmin) {
            return({ message :  'User is not admin' });
        }
        const isUserInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (!isUserInRoom) {
            return({ message :  'User not in room' });
        }
        const isKickedUserOwner = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                owner: toKick,
            },
        });
        if (isKickedUserOwner) {
            return({ message :  'User is owner of room' });
        }
	const updatedRoom = await this.prisma.room.update({
		where: {
			name: body.roomName,
		},
		data: {
			users: {
				disconnect: {
					login: body.loginUserToExecute,
				},
			},
			invitedUsers: {
				disconnect: {
					login: body.loginUserToExecute,
				},
			},
			administrators : {
				disconnect: {
					login: body.loginUserToExecute,
				},
			},
			mutedUsers: {
				disconnect: {
					login: body.loginUserToExecute,
				},
			},
		},
		});
        return { success: "User successfully kicked " }
    }

    async getRoomInfo(body: ChatDtoGetRoom) {
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            }
        });
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        const user = await this.prisma.user.findFirst({
            where: {
                id: body.idUser,
            },
        });
        if (!user) {
            return({ message :  'User does not exist' });
        }
        const isUserInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        id: body.idUser,
                    },
                },
            },
        });
        if (!isUserInRoom) {
            return({ message :  'User not in room' });
        }
        //select roominfo with users administrators message and mutedusers but without password and token in user table
        const roomInfo = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
            select: {
                name: true,
                ownerId: true,
				invitedUsers : {
					select : {
						login : true,
					},
				},
                users: {
                    select: {
                        first_name: true,
                        last_name: true,
                        id: true,
                        login: true,
                        large_pic: true,
                        small_pic: true,
                        medium_pic: true,
                    },
                },
                administrators: {
                    select: {
                        id: true,
                        login: true,
                    },
                },
                messages: {
                    select: {
						senderLogin : true,
                        content: true,
                    },
					orderBy : {
						id : 'asc',
					},
                },
                mutedUsers: {
                    select: {
                        id: true,
                        login: true,
                    },
                },
                bannedUsers: {
                    select: {
                        id: true,
                        login: true,
                    },
                },
            },
        });
        return roomInfo;
    }


    async getRooms(body: ChatDtoGetRoom)
    {
        const user = await this.prisma.user.findFirst({
            where: {
                id: body.idUser,
            },
        });
        if (!user)
        {
            return({ message :  'User does not exist' });
        }
        const roomsOfUser = await this.prisma.user.findFirst({
            where: {
                id: body.idUser,
            },
            select : {
                rooms : {
                    select : {
                        name : true,
						type: true,
                    },
                },
            },
        });
        return roomsOfUser;
    }

    async banUser(body: ChatDtoAdminOperation)
    {
        const admin = await this.prisma.user.findFirst({
            where: {
                id: body.idAdmin,
            },
        });
        if (!admin) {
            return({ message :  'User does not exist' });
        }
        const toBan = await this.prisma.user.findFirst({
            where: {
                login: body.loginUserToExecute,
            },
        });
		if (admin.id == toBan.id) {
			return({ message :  'You cannot ban yourself' });
		}
        if (!toBan) {
            return({ message :  'User to ban does not exist' });
        }
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
        });
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        const isAdmin = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                administrators: {
                    some: {
                        id: body.idAdmin,
                    },
                },
            },
        });
        if (!isAdmin) {
            return({ message :  'User is not admin' });
        }
        const isUserInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (!isUserInRoom) {
            return({ message :  'User not in room' });
        }
        const isBanned = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                bannedUsers: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (isBanned) {
            return({ message :  'User already banned' });
        }
        const isBannedUserOwner = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                owner: toBan,
            },
        });
        if (isBannedUserOwner) {
            return({ message :  'User is owner of room' });
        }
        await this.prisma.room.update({
            where: {
                name: body.roomName,
            },
            data: {
                mutedUsers: {
                    disconnect: {
                        login: body.loginUserToExecute,
                    },
                },
                bannedUsers: {
                    connect: {
                        login: body.loginUserToExecute,
                    },
                },
                users: {
                    disconnect : {
                        login : body.loginUserToExecute,
                    }
                },
                invitedUsers : {
                    disconnect : {
                        login : body.loginUserToExecute,
                    }
                },
                administrators: {
                    disconnect: {
                        login: body.loginUserToExecute,
                    }
                },
            },
        });
        return { success: "User successfully banned" }
    }
    async leaveRoom(body: ChatDtoJoinRoom)
    {
        const user = await this.prisma.user.findFirst({
            where: {
                id: body.idUser,
            },
        });
        if (!user) {
            return({ message :  'User does not exist' });
        }
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
        });
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        const isUserInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        id: body.idUser,
                    },
                },
            },
        });
        if (!isUserInRoom) {
            return({ message :  'User not in room' });
        }
        const isUserOwner = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                ownerId: body.idUser,
            },
        });
        if (isUserOwner) {
           await this.prisma.room.update({
                where: {
                    name: body.roomName,
                },
                data: {
                    users: {
                        disconnect: {
                            id: body.idUser,
                        },
                    },
                    invitedUsers: {
                        disconnect: {
                            id: body.idUser,
                        },
                    },
                    administrators: {
                        disconnect: {
                            id: body.idUser,
                        },
                    },
                },
            });
            const newOwner = await this.prisma.room.findFirst({
                where: {
                    name: body.roomName,
                },
                select : {
                    administrators : {
                        take : 1,
                    }
                }
            });
            if (newOwner.administrators.length > 0) {
                await this.prisma.room.update({
                    where: {
                        name: body.roomName,
                    },
                    data: {
                        ownerId: newOwner.administrators[0].id,
                    },
                });
            }
            else
            {
                const newOwner = await this.prisma.room.findFirst({
                    where: {
                        name: body.roomName,
                    },
                    select : {
                        users : {
                            take : 1,
                        },
                    },
                });
                if (newOwner.users.length > 0) {
                    await this.prisma.room.update({
                        where: {
                            name: body.roomName,
                        },
                        data: {
                            ownerId: newOwner.users[0].id,
							administrators : {
								connect : {
									id : newOwner.users[0].id,
								},
							},
                        },
                    });
                }
                else
                {
                    await this.prisma.room.delete({
                        where : {
                            name : body.roomName,
                        }
                    });
					return { success : "Room deleted" };
                }
            }
        }
        await this.prisma.room.update({
            where: {
                name: body.roomName,
            },
            data : {
                users: {
                    disconnect: {
                        id: body.idUser,
                    },
                },
                invitedUsers: {
                    disconnect: {
                        id: body.idUser,
                    },
                },
                administrators: {
                    disconnect: {
                        id: body.idUser,
                    },
                },
            },
        });
        return { success: "User successfully left room" }
    }

    async giveAdmin(body: ChatDtoAdminOperation)
    {
        const admin = await this.prisma.user.findFirst({
            where: {
                id: body.idAdmin,
            },
        });
        const user = await this.prisma.user.findFirst({
            where: {
                login: body.loginUserToExecute,
            },
        });
        if (!user) {
            return({ message :  'User does not exist' });
        }
        if (!admin) {
            return({ message :  'Admin does not exist' });
        }
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
        });
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        const isUserInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (!isUserInRoom) {
            return({ message :  'User not in room' });
        }
        const isAdminAdmin = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                administrators: {
                    some: {
                        id: body.idAdmin,
                    },
                },
            },
        });
        if (!isAdminAdmin) {
            return({ message :  'User is not admin' });
        }
        const isUserAdmin = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                administrators: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (isUserAdmin) {
            return({ message :  'User is already admin' });
        }
        await this.prisma.room.update({
            where: {
                name: body.roomName,
            },
            data: {
                administrators: {
                    connect: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        await this.prisma.user.update({
            where: {
                login: body.loginUserToExecute,
            },
            data: {
                administratedRooms: {
                    connect: {
                        name: body.roomName,
                    },
                },
            },
        });
		const ret = await this.prisma.room.findFirst({
			where : {
				name : body.roomName,
			},
			select : {
				administrators : {
					select : {
						login : true,
					},
				},
			},
		});
        return { administrator:  ret}
    }
    async removeAdmin(body: ChatDtoAdminOperation)
    {
        const admin = await this.prisma.user.findFirst({
            where: {
                id: body.idAdmin,
            },
        });
        const user = await this.prisma.user.findFirst({
            where: {
                login: body.loginUserToExecute,
            },
        });
        if (!user) {
            return({ message :  'User does not exist' });
        }
        if (!admin) {
            return({ message :  'Admin does not exist' });
        }
		if (user.id == admin.id)
			return({ message :  'Can\'t remove admin by yourself' });
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
        });
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        const isUserInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (!isUserInRoom) {
            return({ message :  'User not in room' });
        }
        const isAdminAdmin = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                administrators: {
                    some: {
                        id: body.idAdmin,
                    },
                },
            },
        });
        if (!isAdminAdmin) {
            return({ message :  'User is not admin' });
        }
        const isUserAdmin = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                administrators: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        const isAdminOwner = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                owner: {
                    login: body.loginUserToExecute,
                },
            },
        });
        if (isAdminOwner) {
            return({ message :  'User is owner' });
        }
        if (!isUserAdmin) {
            return({ message :  'User is not admin' });
        }
        await this.prisma.room.update({
            where: {
                name: body.roomName,
            },
            data: {
                administrators: {
                    disconnect: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        await this.prisma.user.update({
            where: {
                login: body.loginUserToExecute,
            },
            data: {
                administratedRooms: {
                    disconnect: {
                        name: body.roomName,
                    },
                },
            },
        });
        return { success: "User successfully removed admin" }
    }
    async giveOwner(body: ChatDtoAdminOperation)
    {
        const owner = await this.prisma.user.findFirst({
            where: {
                id: body.idAdmin,
            },
        });
        const user = await this.prisma.user.findFirst({
            where: {
                login: body.loginUserToExecute,
            },
        });
        if (!user) {
            return({ message :  'User does not exist' });
        }
        if (!owner) {
            return({ message :  'Owner does not exist' });
        }
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
        });
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        const isUserInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (!isUserInRoom) {
            return({ message :  'User not in room' });
        }
        const isOwnerOwner = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                ownerId: body.idAdmin,
            },
        });
        if (!isOwnerOwner) {
            return({ message :  'User is not owner' });
        }
        const isUserOwner = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                ownerId: user.id,
            },
        });
        if (isUserOwner) {
            return({ message :  'User is already owner' });
        }
        await this.prisma.room.update({
            where: {
                name: body.roomName,
            },
            data: {
                ownerId: user.id,
                administrators : {
                    connect: {
                        login: body.loginUserToExecute,
                    },
                }
            },
        });
        await this.prisma.user.update({
            where: {
                login: body.loginUserToExecute,
            },
            data: {
                ownedRooms: {
                    connect: {
                        name: body.roomName,
                    },
                },
                administratedRooms : {
                    connect: {
                        name: body.roomName,
                    },
                },
            },
        });
        await this.prisma.user.update({
            where: {
                id: body.idAdmin,
            },
            data: {
                ownedRooms: {
                    disconnect: {
                        name: body.roomName,
                    },
                },
                administratedRooms : {
                    disconnect: {
                        name: body.roomName,
                    },
                },
            },
        });
        return { success: "User successfully given owner" }
    }
    async removeInvite(body: ChatDtoAdminOperation)
    {
        const admin = await this.prisma.user.findFirst({
            where: {
                id: body.idAdmin,
            },
        });
        const user = await this.prisma.user.findFirst({
            where: {
                login: body.loginUserToExecute,
            },
        });
        if (!user) {
            return({ message :  'User does not exist' });
        }
        if (!admin) {
            return({ message :  'User who remove invite does not exist' });
        }
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
        });
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        const isUserInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (isUserInRoom) {
            return({ message :  'User has already accepted invitation in room' });
        }
        const isUserInvited = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                invitedUsers: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (!isUserInvited) {
            return({ message :  'User is not invited in room' });
        }
        if (body.idAdmin == user.id)
        {
            await this.prisma.room.update({
                where: {
                    name: body.roomName,
                },
                data: {
                    invitedUsers: {
                        disconnect: {
                            login: body.loginUserToExecute,
                        },
                    },
                },
            });
            await this.prisma.user.update({
                where: {
                    login: body.loginUserToExecute,
                },
                data: {
                    invitedRooms: {
                        disconnect: {
                            name: body.roomName,
                        },
                    },
                },
            });
            return { success: "User successfully removed invite" }
        }
        else
        {
            return({ message :  'Only user can remove his own invite' });
        }
    }
    async unbanUser(body: ChatDtoAdminOperation)
    {
        const admin = await this.prisma.user.findFirst({
            where: {
                id: body.idAdmin,
            },
        });
        const user = await this.prisma.user.findFirst({
            where: {
                login: body.loginUserToExecute,
            },
        });
        if (!user) {
            return({ message :  'User does not exist' });
        }
        if (!admin) {
            return({ message :  'User who unban does not exist' });
        }
        const room = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
            },
        });
        if (!room) {
            return({ message :  'Room does not exist' });
        }
        const isUserInRoom = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                users: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (isUserInRoom) {
            return({ message :  'User is in room' });
        }
        const isUserBanned = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                bannedUsers: {
                    some: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        if (!isUserBanned) {
            return({ message :  'User is not banned in room' });
        }
        const isAdminAdmin = await this.prisma.room.findFirst({
            where: {
                name: body.roomName,
                administrators: {
                    some: {
                        id: body.idAdmin,
                    },
                },
            },
        });
        if (!isAdminAdmin) {
            return({ message :  'User is not admin' });
        }
        await this.prisma.room.update({
            where: {
                name: body.roomName,
            },
            data: {
                bannedUsers: {
                    disconnect: {
                        login: body.loginUserToExecute,
                    },
                },
            },
        });
        await this.prisma.user.update({
            where: {
                login: body.loginUserToExecute,
            },
            data: {
                bannedRooms: {
                    disconnect: {
                        name: body.roomName,
                    },
                },
            },
        });
        return { success: "User successfully unbanned" }
    }
    async createPrivateRoom(body: PrivateChatDtoCreateRoom)
    {
        const uniqueId = uuidv4();
        const user = await this.prisma.user.findFirst({
            where: {
                id: body.idUser,
            },
        });
        if (!user)
        {
            return({ message :  'User does not exist' });
        }
        const user2 = await this.prisma.user.findFirst({
            where: {
                login: body.loginReceiver,
            },
        });
        if (!user2 || !user2.id)
        {
            return({ message :  'User who try to send message does not exist' });
        }
		if (user.id == user2.id)
			return ({ message : "You can't talk to yourself"})
		const hasBlocked = await this.prisma.user.findFirst({
			where: {
				id: user2.id,
				blockedUsers: {
					some: {
						id: body.idUser,
					},
				},
			},
		});
		const isBlocked = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
				blockedUsers: {
					some: {
						id: user2.id,
					},
				},
			},
		});
		if (hasBlocked)
		{
			return({ message :  'User has blocked you' });
		}
		if (isBlocked)
		{
			return({ message :  'User is blocked' });
		}
		const privateRoomAlreadyExist = await this.prisma.privateRoom.findFirst({
			where: {
				users: {
					every: {
						id: {
							in: [body.idUser, user2.id],
						},
					},
				},
			},
		});
		if (privateRoomAlreadyExist)
		{
			return({ message :  'Private room already exist' });
		}
        const privateRoom = await this.prisma.privateRoom.create({
            data : {
                id: uniqueId,
                users: {
                    connect: [
                        {
                            id: body.idUser,
                        },
                        {
                            id: user2.id,
                        },
                    ],
                },
            },
        });
        await this.prisma.user.update({
            where: {
                id: body.idUser,
            },
            data: {
                privateRoom: {
                    connect: {
                        id: uniqueId,
                    },
                },
            },
        });
        await this.prisma.user.update({
            where: {
                id: user2.id,
            },
            data: {
                privateRoom: {
                    connect: {
                        id: uniqueId,
                    },
                },
            },
        });
		const id = await this.prisma.privateRoom.findFirst({
			where: {
				id: uniqueId,
			},
			select : {
				id : true,
			}
		});
        return ({login : body.loginReceiver, id : id});
    }
    async addMessageToPrivateRoom(body : PrivateChatDtoCreateMessage)
    {
        const userReceiver = await this.prisma.user.findFirst({
            where: {
                login: body.loginReceiver,
            },
        });
        const privateRoom = await this.prisma.privateRoom.findFirst({
            where : {
                users: {
                    every: {
                        id: {
                            in: [body.idSender, userReceiver.id],
                        },
                    },
                }
            }
        });
        const message = await this.prisma.message.create({
            data: {
                content: body.content,
                sender: {
                    connect: {
                        id: body.idSender,
                    },
                },
                privateRoom: {
                    connect: {
                        id: privateRoom.id,
                    },
                },
            },
        });
        await this.prisma.privateRoom.update({
            where: {
                id: privateRoom.id,
            },
            data: {
                messages: {
                    connect: {
                        id: message.id,
                    },
                },
            },
        });
        return { success: "Message successfully added" }
    }

	async addMessageToRoom(body: ChatDtoCreateMessage)
	{
		const user = await this.prisma.user.findFirst({
			where: {
				id: body.idSender,
			},
		});
		if (!user)
		{
			return({ message :  'User does not exist' });
		}
		const room = await this.prisma.room.findFirst({
			where: {
				name: body.roomName,
			},
		});
		if (!room)
		{
			return({ message :  'Room does not exist' });
		}
		const isUserInRoom = await this.prisma.room.findFirst({
			where: {
				name: body.roomName,
				users: {
					some: {
						login: user.login,
					},
				},
			},
		});
		if (!isUserInRoom)
		{
			return({ message :  'User is not in room' });
		}
		const isUserBanned = await this.prisma.room.findFirst({
			where: {
				name: body.roomName,
				bannedUsers: {
					some: {
						login: user.login,
					},
				},
			},
		});
		if (isUserBanned)
		{
			return({ message :  'User is banned in room' });
		}
		const message = await this.prisma.message.create({
			data: {
				content: body.content,
				sender: {
					connect: {
						id: body.idSender,
					},
				},
				room: {
					connect: {
						name: body.roomName,
					},
				},
			},
		});
		await this.prisma.room.update({
			where: {
				name: body.roomName,
			},
			data: {
				messages: {
					connect: {
						id: message.id,
					},
				},
			},
		});
		return { success: "Message successfully added" }

	}

    async getPrivateRooms(body: ChatDtoGetRoom)
    {
        const user = await this.prisma.user.findFirst({
            where: {
                id: body.idUser,
            },
        });
        if (!user)
        {
            return({ message :  'User does not exist' });
        }
        const privateRooms = await this.prisma.privateRoom.findMany({
            where: {
                users: {
                    some: {
                        id: body.idUser,
                    },
                },
            },
            select: {
                users: {
                    where : {
						id: {
							not: body.idUser,
						},
					},
					select: {
						login: true,
					},
                },
            }
        });
        return privateRooms;
    }
    async getPrivateRoomInfo(body: ChatDtoGetRoom)
    {
        if (!body.roomName)
            return({ message :  'Room name is required' });

		const user = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
			},
		});
		const user2 = await this.prisma.user.findFirst({
			where: {
				login: body.roomName,
			},
		});
		if (!user || !user2)
		{
			return({ message :  'User does not exist' });
		}
		const privateRoom = await this.prisma.privateRoom.findFirst({
			where : {
				users: {
					every : {
						login : {
							in : [user.login, user2.login],
						}
					}
				},
			},
			select : {
					id : true,
					users: {
						where : {
							login : {
								notIn : [user.login],
							},
						},
						select : {
							login : true,
						}
					},
					messages: {
						select: {
							content: true,
							sender: {
								select: {
									login: true,
								},
							},
						},
						orderBy: {
							id: 'asc',
						},
					},
			},
		});
        if (!privateRoom)
            return({ message :  'Room does not exist' });
        return privateRoom;
    }
	async blockUser(body: ChatDtoBlockUser)
	{
		const user = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
			},
		});
		if (!user)
			return({ message :  'User does not exist' });
		const userToBlock = await this.prisma.user.findFirst({
			where: {
				login: body.loginUserToBlock,
			},
		});
		if (!userToBlock)
			return({ message :  'User to block does not exist' });
		if (user.id == userToBlock.id)
			return({ message :  'You cannot block yourself' });
		const isAlreadyBlocked = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
				blockedUsers: {
					some: {
						login: body.loginUserToBlock,
					},
				},
			},
		});
		if (isAlreadyBlocked)
			return({ message :  'User is already blocked' });
		await this.prisma.user.update({
			where: {
				id: body.idUser,
			},
			data: {
				blockedUsers: {
					connect: {
						login: body.loginUserToBlock,
					},
				},
			},
		});
		const blockedUser = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
			},
			select: {
				blockedUsers: {
					select : {
						login : true,
					},
				},
			},
		});
		return { blockedUsers: blockedUser.blockedUsers}
	}
	async unblockUser(body: ChatDtoBlockUser)
	{
		const user = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
			},
		});
		if (!user)
			return({ message :  'User does not exist' });
		const userToUnblock = await this.prisma.user.findFirst({
			where: {
				login: body.loginUserToBlock,
			},
		});
		if (!userToUnblock)
			return({ message :  'User to unblock does not exist' });
		if (user.id == userToUnblock.id)
			return({ message :  'You cannot unblock yourself' });
		const isBlocked = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
				blockedUsers: {
					some: {
						login: body.loginUserToBlock,
					},
				},
			},
		});
		if (!isBlocked)
			return({ message :  'User is not blocked' });
		await this.prisma.user.update({
			where: {
				id: body.idUser,
			},
			data: {
				blockedUsers: {
					disconnect: {
						login: body.loginUserToBlock,
					},
				},
			},
		});
		const blockedUser = await this.prisma.user.findFirst({
			where: {
				login: body.loginUserToBlock,
			},
			select: {
				blockedUsers: {
					select : {
						login : true,
				},
			},
			},
		});
		return { blockedUser}
	}
	async muteUser(body: ChatDtoAdminOperation)
	{
		const user = await this.prisma.user.findFirst({
			where: {
				id: body.idAdmin,
			},
		});
		if (!user)
			return({ message :  'User does not exist' });
		const userToMute = await this.prisma.user.findFirst({
			where: {
				login: body.loginUserToExecute,
			},
		});
		const room = await this.prisma.room.findFirst({
			where: {
				name: body.roomName,
			},
		});
		if (!room)
			return({ message :  'Room does not exist' });
		if (!userToMute)
			return({ message :  'User to mute does not exist' });
		if (user.id == userToMute.id)
			return({ message :  'You cannot mute yourself' });
		const isAlreadyMuted = await this.prisma.user.findFirst({
			where: {
				login: body.loginUserToExecute,
				mutedRooms: {
					some: {
						name: body.roomName,
					},
				},
			},
		});
		if (isAlreadyMuted)
			return({ message :  'User is already muted' });
		const isUserAdmin = await this.prisma.user.findFirst({
			where: {
				id: body.idAdmin,
				administratedRooms: {
					some: {
						name: body.roomName,
					},
				},
			},
		});
		if (!isUserAdmin)
			return({ message :  'You are not admin of this room' });
		if (room.ownerId == userToMute.id)
			return({ message :  'You cannot mute owner of the room' });
		if (!body.muteDuration || body.muteDuration <= 0)
			return({ message :  'Mute duration must be positive' });
		const minutesToAdd = body.muteDuration; // Get the number of minutes to add from the request body
		const date = new Date(); // Create a new Date object representing the current date and time
		date.setMinutes(date.getMinutes() + minutesToAdd); // Add the specified number of minutes to the date object
		await this.prisma.user.update({
			where: {
				login: body.loginUserToExecute,
			},
			data: {
				mutedRooms: {
					connect: {
						name: body.roomName,
					},
				},
				timestampMuted : date,
			},
		});
		const mutedUsers = await this.prisma.room.findFirst({
			where: {
				name: body.roomName,
			},
			select: {
				mutedUsers: {
					select: {
						login: true,
					},
				},
			},
		});
		return { mutedUsers : mutedUsers, success: "User successfully muted" }
	}
	async unmuteUser(body: ChatDtoAdminOperation)
	{
		const user = await this.prisma.user.findFirst({
			where: {
				id: body.idAdmin,
			},
		});
		if (!user)
			return({ message :  'User does not exist' });
		const userToUnmute = await this.prisma.user.findFirst({
			where: {
				login: body.loginUserToExecute,
			},
		});
		const isUserAdmin = await this.prisma.user.findFirst({
			where: {
				id: body.idAdmin,
				administratedRooms: {
					some: {
						name: body.roomName,
					},
				},
			},
		});
		if (!isUserAdmin)
			return({ message :  'You are not admin of this room' });
		if (!userToUnmute)
			return({ message :  'User to unmute does not exist' });
		if (user.id == userToUnmute.id)
			return({ message :  'You cannot unmute yourself' });
		const isMuted = await this.prisma.user.findFirst({
			where: {
				login: body.loginUserToExecute,
				mutedRooms: {
					some: {
						name: body.roomName,
					},
				},
			},
		});
		if (!isMuted)
			return({ message :  'User is not muted' });
		await this.prisma.user.update({
			where: {
				login: body.loginUserToExecute,
			},
			data: {
				mutedRooms: {
					disconnect: {
						name: body.roomName,
					},
				},
				timestampMuted : null,
			},
		});
		return { success: "User successfully unmuted" }
	}
	async changePassword(body: ChatDtoJoinRoom)
	{
		const user = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
			},
		});
		if (!user)
			return({ message :  'User does not exist' });
		const room = await this.prisma.room.findFirst({
			where: {
				name: body.roomName,
			},
		});
		if (!room)
			return({ message :  'Room does not exist' });
		const isUserAdmin = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
				administratedRooms: {
					some: {
						name: body.roomName,
					},
				},
			},
		});
		if (!isUserAdmin)
			return({ message :  'You are not admin of this room' });
		if (room.type == "public")
			return({ message :  'You cannot change password of public room' });
		if (room.type == "private")
			return({ message :  'You cannot change password of private room' });
		if (body.password == null || body.password == '')
			return({ message :  'Password cannot be empty' });
		const hash = await argon.hash(body.password);
		await this.prisma.room.update({
			where: {
				name: body.roomName,
			},
			data: {
				password: hash,
			},
		});
		return { success: "Password successfully changed" }


	}
	async changeRoomType(body: ChatDtoCreateRoom)
	{
		const user = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
			},
		});
		if (!user)
			return({ message :  'User does not exist' });
		const room = await this.prisma.room.findFirst({
			where: {
				name: body.roomName,
			},
		});
		if (!room)
			return({ message :  'Room does not exist' });
		const isUserAdmin = await this.prisma.user.findFirst({
			where: {
				id: body.idUser,
				administratedRooms: {
					some: {
						name: body.roomName,
					},
				},
			},
		});
		if (!isUserAdmin)
			return({ message :  'You are not admin of this room' });
		if (body.type == "public" || body.type == "private")
		{
			body.password = '';
		}
		if (room.type == body.type)
			return({ message :'Room is already ' + body.type });
		else if (body.type == "protected" && (body.password == null || body.password == ''))
			return({ message :  'Password cannot be empty' });
		const hash = await argon.hash(body.password);
		await this.prisma.room.update({
			where: {
				name: body.roomName,
			},
			data: {
				type: body.type,
				password: hash,
			},
		});
		return { success: "Room type successfully changed" }
	}
}
