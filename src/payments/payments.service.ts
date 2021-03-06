import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Interval } from '@nestjs/schedule';
import { Restaurant } from "src/restaurants/entities/restaurants.entity";
import { User } from "src/users/entities/user.entitiy";
import { LessThan, Repository } from "typeorm";
import { CreatePaymentInput, CreatePaymentOutput } from "./dtos/create-payment.dto";
import { GetPaymentsOutput } from "./dtos/get-payment.dto";
import { Payment } from "./entities/payments.entity";

@Injectable()
export class PaymentService {
    constructor(
        @InjectRepository(Payment)
        private readonly payments: Repository<Payment>,
        @InjectRepository(Restaurant)
        private readonly restaurant: Repository<Restaurant>,
    ) { }
    
    async createPayment(owner: User, { transactionId, restaurantId}: CreatePaymentInput):Promise<CreatePaymentOutput> {
        try {
            const restaurant = await this.restaurant.findOne(restaurantId);
            if (!restaurant) {
                return {
                    ok: false,
                    error: 'Restaurant not found.'
                }
            }

            if (restaurant.ownerId != owner.id) {
                return {
                    ok: false,
                    error: 'You are not allowed to do this.',
                }
            }

            const date = new Date();
            date.setDate(date.getDate() + 7);
            restaurant.isPromoted = true;
            restaurant.promotedUntil = date;
            await this.restaurant.save(restaurant);

            await this.payments.save(
                this.payments.create({
                    transactionId,
                    restaurant,
                    user: owner
                })
            );
            return {
                ok: true
            }
        } catch (error) {
            return {
                ok: false,
                error: 'Could not create payment.'
            }
        }
    }

    async getPayments(user: User): Promise<GetPaymentsOutput> {
        try {
            const payments = await this.payments.find({ user: user });
            return {
                ok: true,
                payments,
            };
        } catch {
            return {
                ok: false,
                error: 'Could not load payments.',
            };
        }
    }

    @Interval(2000)
    async checkPromotedRestaurants() {
        const restaurants = await this.restaurant.find({
            isPromoted: true,
            promotedUntil: LessThan(new Date())
        });

        restaurants.forEach(async restaurant => {
            restaurant.isPromoted = false;
            restaurant.promotedUntil = null;
            this.restaurant.save(restaurant);
        });
    }
}