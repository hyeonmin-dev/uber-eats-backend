import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getConnection, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entitiy';
import { getRepositoryToken } from '@nestjs/typeorm';
import { userInfo } from 'os';
import { Verification } from 'src/users/entities/verification.entity';
import { query } from 'express';

jest.mock('got', () => {
  return {
    post: jest.fn(),
  };
});

const GRAPHQL_ENDPOINT = '/graphql';
const testUser = {
  email: "dev@gmail.com",
  password: "0000",
};

describe('UserModule (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let verificationRepository: Repository<Verification>;
  let jwtToken: string;

  const baseTest = () => request(app.getHttpServer()).post(GRAPHQL_ENDPOINT);
  const publicTest = (query: string) => baseTest().send({ query });
  const privateTest = (query: string) => baseTest().set('x-jwt', jwtToken).send({ query })

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    verificationRepository = module.get<Repository<Verification>>(getRepositoryToken(Verification));
    await app.init();
  });

  afterAll(async () => {
    await getConnection().dropDatabase();
    app.close();
  });

  describe('createAcctount', () => {
    it('should create account', () => {
      return publicTest(`
          mutation {
            createAccount(input : {
              email: "${testUser.email}",
              password: "${testUser.password}",
              role: Owner
            }) {
              ok
              error
            }
          }
        `).expect(200)
        .expect(res => {
          expect(res.body.data.createAccount.ok).toBe(true);
        });
    });

    it('should fail if account already exist', () => {
      return publicTest(`
            mutation {
              createAccount(input : {
                email: "${testUser.email}",
                password: "${testUser.password}",
                role: Owner
              }) {
                ok
                error
              }
            }
          `)
        .expect(200)
        .expect(res => {
          expect(res.body.data.createAccount.ok).toBe(false);
          expect(res.body.data.createAccount.error).toBe(
            'There is a user with that email already',
          );
        });
    });
  });

  describe('login', () => {
    it('should login with correct credentials', () => {
      return publicTest(`
            mutation {
              login(input:{
              email:"${testUser.email}",
              password:"${testUser.password}",
              }) {
                ok
                error
                token
              }
            }
          `)
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: { login },
            },
          } = res;
          expect(login.ok).toBe(true);
          expect(login.error).toBe(null);
          expect(login.token).toEqual(expect.any(String));
          jwtToken = login.token;
        });
    });

    it('should not be able to login with wrong credentials', () => {
      return publicTest(`
            mutation {
              login(input:{
                email:"${testUser.email}",
                password:"xxx",
              }) {
                ok
                error
                token
              }
            }
          `)
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: { login },
            },
          } = res;
          expect(login.ok).toBe(false);
          expect(login.error).toBe('Wrong password');
          expect(login.token).toBe(null);
        });
    });
  });

  describe('userProfile', () => {
    let userId: number;

    beforeAll(async () => {
      const [user] = await userRepository.find();
      userId = user.id;
    });

    it("should see a user's profile", () => {
      return privateTest(`
         {
           userProfile(id:${userId}){
             ok
             error
             user {
               id
             }
           }
         }
         `)
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                userProfile: {
                  ok,
                  error,
                  user: { id },
                },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
          expect(id).toBe(userId);
        });
    });

    it("should not find user's profile", () => {
      return privateTest(`
         {
           userProfile(id: 99){
             ok
             error
           }
         }
         `)
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                userProfile: {
                  ok,
                  error,
                },
              },
            },
          } = res;
          expect(ok).toBe(false);
          expect(error).toBe("User Not Found");
        });
    });
  });

  describe('me', () => {
    it('should find my profile', () => {
      return privateTest(`
            {
              me {
                email
              }
            }
          `)
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                me: { email },
              },
            },
          } = res;

          expect(email).toEqual(testUser.email);
        });
    });

    it('should not allow logged out user', () => {
      return publicTest(`
            {
              me {
                email
              }
            }
          `)
        .expect(200)
        .expect(res => {
          const {
            body: { errors },
          } = res;
          const [error] = errors;
          expect(error.message).toBe('Forbidden resource');
        })
    });
  });

  describe('editProfile', () => {
    const NEW_EMAIL = 'test@new.com';

    it('should change email', () => {
      return privateTest(`
             mutation {
               editProfile(input:{
                 email: "${NEW_EMAIL}"
               }) {
                 ok
                 error
               }
             }
             `)
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                editProfile: { ok, error },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
        })
    });

    it('should have new email', () => {
      return privateTest(`
           {
             me {
               email
             }
           }
         `)
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                me: { email },
              },
            },
          } = res;
          expect(email).toBe(NEW_EMAIL);
        });
    });
  });

  describe('verifyEmail', () => {
    let verificationCode: string;

    beforeAll(async () => {
      const [verification] = await verificationRepository.find();
      verificationCode = verification.code;
    });

    it('should verify email', () => {
      return publicTest(`
           mutation {
             verifyEmail(input:{
               code:"${verificationCode}"
             }){
               ok
               error
             }
           }
         `)
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                verifyEmail: { ok, error },
              },
            },
          } = res;
          expect(ok).toBe(true);
          expect(error).toBe(null);
        });
    });

    it('should fail on verification code not found', () => {
      return privateTest(`
           mutation {
             verifyEmail(input:{
               code:"xxxxx"
             }){
               ok
               error
             }
           }
         `)
        .expect(200)
        .expect(res => {
          const {
            body: {
              data: {
                verifyEmail: { ok, error },
              },
            },
          } = res;
          expect(ok).toBe(false);
          expect(error).toBe('Verification not found.');
        });
    });
  });
});
