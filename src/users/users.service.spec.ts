import { Test } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm";
import { truncate } from "fs";
import { JwtService } from "src/jwt/jwt.service";
import { MailService } from "src/mail/mail.service";
import { Repository } from "typeorm";
import { User } from "./entities/user.entitiy";
import { Verification } from "./entities/verification.entity";
import { UserService } from "./users.service"

const mockRepository = () => ({
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
})

const mockMailService = {
    sendVerificationEmail: jest.fn(),
    sendMailer: jest.fn(),
}

const mockJwtService = {
    sign: jest.fn(() => 'signed-token-baby'),
    verify: jest.fn()
}

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;
let verificationsRepository: MockRepository<Verification>;

describe('UserService', () => {
    let service: UserService;
    let usersRepository: MockRepository;
    let verificationsRepository: MockRepository;
    let mailService: MailService;
    let jwtService: JwtService;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                UserService,
                {
                    provide: getRepositoryToken(User),
                    useValue: mockRepository()
                },
                {
                    provide: getRepositoryToken(Verification),
                    useValue: mockRepository()
                },
                {
                    provide: MailService,
                    useValue: mockMailService
                },
                {
                    provide: JwtService,
                    useValue: mockJwtService
                }
            ],
        }).compile();
        service = module.get<UserService>(UserService);
        mailService = module.get<MailService>(MailService);
        jwtService = module.get<JwtService>(JwtService);
        usersRepository = module.get(getRepositoryToken(User));
        verificationsRepository = module.get(getRepositoryToken(Verification));
    });

    it('be defined', () => {
        expect(service).toBeDefined();
    });

    describe('createAccount', () => {
        const createAccountArgs = {
            email: "",
            password: "",
            role: 0
        }

        it('should fail if user exists', async () => {
            usersRepository.findOne.mockResolvedValue({
                id: 1,
                email: ""
            });

            const result = await service.createAccount(createAccountArgs);

            expect(result).toMatchObject({
                ok: false,
                error: "There is a user with that email already"
            })
        });

        it('should create a new user', async () => {
            usersRepository.findOne.mockResolvedValue(undefined);
            usersRepository.create.mockReturnValue(createAccountArgs);
            usersRepository.save.mockResolvedValue(createAccountArgs);
            verificationsRepository.create.mockReturnValue({
                user: createAccountArgs,
            });
            verificationsRepository.save.mockResolvedValue({
                code: 'code',
            });

            const result = await service.createAccount(createAccountArgs);
            expect(usersRepository.create).toHaveBeenCalledTimes(1);
            expect(usersRepository.create).toHaveBeenCalledWith(createAccountArgs);
            expect(usersRepository.save).toHaveBeenCalledTimes(1);
            expect(usersRepository.save).toHaveBeenCalledWith(createAccountArgs);

            expect(verificationsRepository.create).toHaveBeenCalledTimes(1);
            expect(verificationsRepository.create).toHaveBeenCalledWith({
                user: createAccountArgs,
            });

            expect(verificationsRepository.save).toHaveBeenCalledTimes(1);
            expect(verificationsRepository.save).toHaveBeenCalledWith({
                user: createAccountArgs,
            });

            /*expect(mailService.sendMailer).toHaveBeenCalledTimes(1);
            expect(mailService.sendMailer).toHaveBeenCalledWith(
                expect.any(String),
            );*/
            expect(result).toEqual({ ok: true });
        });

        it('should fail on exception', async () => {
            usersRepository.findOne.mockRejectedValue(new Error());
            const result = await service.createAccount(createAccountArgs);
            expect(result).toEqual({ ok: false, error: "Couldn't create user" });
        });
    });

    describe('login', () => {
        const loginArgs = {
            email: 'test@email.com',
            password: 'test',
        }

        it('should fail if user does not exit', async () => {
            usersRepository.findOne.mockResolvedValue(null);
            const result = await service.login(loginArgs);

            expect(usersRepository.findOne).toHaveBeenCalledTimes(1);
            expect(usersRepository.findOne).toBeCalledWith(
                expect.any(Object),
                expect.any(Object)
            );
            expect(result).toEqual({ ok: false, error: "User not found." });
        });

        it('should fail if the password is wrong', async () => {
            const mockedUser = {
                checkPassword: jest.fn(() => Promise.resolve(false))
            };
            usersRepository.findOne.mockResolvedValue(mockedUser);
            const result = await service.login(loginArgs);
            expect(result).toEqual({ ok: false, error: 'Wrong password' });
        });

        it('should return tocket if password correct', async () => {
            const mockedUser = {
                id: 1,
                checkPassword: jest.fn(() => Promise.resolve(true)),
            };
            usersRepository.findOne.mockResolvedValue(mockedUser);
            usersRepository.update.mockResolvedValue(1);
            const result = await service.login(loginArgs);

            expect(usersRepository.update).toHaveBeenCalledTimes(1);
            //expect(jwtService.sign).toHaveBeenCalledTimes(1);
            //expect(jwtService.sign).toHaveBeenCalledWith(expect.any(Number));
            expect(result).toEqual({ ok: true, token: 'signed-token-baby' });
        });

        it('should fail on exception', async () => {
            usersRepository.findOne.mockRejectedValue(new Error());
            const result = await service.login(loginArgs);
            expect(result).toEqual({ ok: false, error: "Can't log user in." });
        });
    });

    describe('findById', () => {
        const findByIdArgs = {
            id: 1
        }

        it('should find an existing user', async () => {
            usersRepository.findOneOrFail.mockResolvedValue(findByIdArgs);
            const result = await service.findById(1);
            expect(result).toEqual({ ok: true, user: findByIdArgs });
        });

        it('should fail if no user if found', async () => {
            usersRepository.findOneOrFail.mockRejectedValue(new Error());
            const result = await service.findById(1);
            expect(result).toEqual({ ok: false, error: "User Not Found" });
        })
    });

    describe('editProfile', () => {
        it('should change email', async () => {
            const oldUser = {
                email: 'test@gmail.com',
                verified: true,
            }

            const editProfileArgs = {
                userId: 1,
                input: { email: 'test@gmail.com' }
            }

            const newVerification = {
                code: 'code',
            };

            const newUser = {
                verified: false,
                email: editProfileArgs.input.email,
            };

            usersRepository.findOne.mockResolvedValue(oldUser);
            verificationsRepository.create.mockReturnValue(newVerification);
            verificationsRepository.save.mockResolvedValue(newVerification);

            await service.editProfile(editProfileArgs.userId, editProfileArgs.input);
            expect(usersRepository.findOne).toHaveBeenCalledTimes(1);
            expect(usersRepository.findOne).toHaveBeenCalledWith(
                editProfileArgs.userId,
            );
            expect(verificationsRepository.create).toHaveBeenCalledWith({
                user: newUser,
            });
            expect(verificationsRepository.save).toHaveBeenCalledWith(
                newVerification,
            );
            /*expect(mailService.sendMailer).toHaveBeenCalledWith(
                newUser.email,
            );*/
        });

        it('should change password', async () => {
            const oldUser = {
                password: 'old',
            }
            const editProfileArgs = {
                userId: 1,
                input: { password: 'new' }
            }

            usersRepository.findOne.mockResolvedValue(oldUser);
            const result = await service.editProfile(editProfileArgs.userId, editProfileArgs.input);
            expect(usersRepository.save).toHaveBeenCalledTimes(1);
            expect(usersRepository.save).toHaveBeenCalledWith(
                editProfileArgs.input
            );

            expect(result).toEqual({ ok: true });
        });

        it('should fail on exception', async () => {
            usersRepository.findOne.mockRejectedValue(new Error());
            const result = await service.editProfile(1, { email: 'test@gmail.com' });
            expect(result).toEqual({ ok: false, error: 'Could not update profile' });
        })
    });

    describe('verifyEmail', () => {
        it('should verify email', async () => {
            const mockedVerification = {
                user: {
                    verified: false,
                },
                id: 1,
            };

            verificationsRepository.findOne.mockResolvedValue(mockedVerification);
            const result = await service.verifyEmail('');

            expect(verificationsRepository.findOne).toHaveBeenCalledTimes(1);
            expect(verificationsRepository.findOne).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
            );
            expect(usersRepository.save).toHaveBeenCalledTimes(1);
            expect(usersRepository.save).toHaveBeenCalledWith({ verified: true });

            expect(verificationsRepository.delete).toHaveBeenCalledTimes(1);
            expect(verificationsRepository.delete).toHaveBeenCalledWith(
                mockedVerification.id,
            );
            expect(result).toEqual({ ok: true });
        });

        it('should fail on verification not found', async () => {
            verificationsRepository.findOne.mockResolvedValue(undefined);
            const result = await service.verifyEmail('');
            expect(result).toEqual({ ok: false, error: 'Verification not found.' });
        });

        it('should fail on exception', async () => {
            verificationsRepository.findOne.mockRejectedValue(new Error());
            const result = await service.verifyEmail('');
            expect(result).toEqual({ ok: false, error: 'Could not verify email.' });
        });
    });
})

/*
// 2. nestJs 
sendMailer(receiver: string) {
    this.mailerService
        .sendMail({
            to: 'hyeonminroh@gmail.com', // list of receivers
            from: this.options.fromEmail, // sender address
            subject: 'Verify Your Email', // Subject line
            html: `Please Confrim Your Email.<br>Hello ${receiver} :)<br>Please confirm your account!<br>Thanks for choosing Nuber eats<br><a href="http://127.0.0.1:3000/confirm?code={{code}}">Click Here to Confirm</a>`, // HTML body content
        })
        .then(() => { console.log("sended"); })
        .catch((e) => { console.log(e); });
}
*/