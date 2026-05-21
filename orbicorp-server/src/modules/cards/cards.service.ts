import prisma from '../../shared/utils/prisma.js';
import { encrypt, decrypt, getLast4, validateCardNumber, validateCVV, validateExpiry } from '../../shared/utils/crypto.js';
import {
  CreateCardInput,
  UpdateCardInput,
  AssignCardInput,
  CreateTransactionInput,
  ListCardsQuery,
  ListTransactionsQuery
} from './cards.schema.js';
import { Prisma } from '@prisma/client';

export class CardsService {
  // ═══════════════════════════════════════════
  // CARD CRUD
  // ═══════════════════════════════════════════

  async create(companyId: string, input: CreateCardInput) {
    // Validate card number
    if (!validateCardNumber(input.cardNumber)) {
      throw new Error('Geçersiz kart numarası');
    }

    // Validate CVV
    if (!validateCVV(input.cvv)) {
      throw new Error('Geçersiz CVV');
    }

    // Validate expiry
    if (!validateExpiry(input.expiryMonth, input.expiryYear)) {
      throw new Error('Kart süresi geçmiş veya geçersiz');
    }

    // Encrypt sensitive data
    const cardNumberEnc = encrypt(input.cardNumber.replace(/\s/g, ''));
    const cvvEnc = encrypt(input.cvv);
    const last4 = getLast4(input.cardNumber);

    const card = await prisma.virtualCard.create({
      data: {
        companyId,
        name: input.name,
        cardHolder: input.cardHolder,
        last4,
        cardNumberEnc,
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear < 100 ? 2000 + input.expiryYear : input.expiryYear,
        cvvEnc,
        monthlyLimit: input.monthlyLimit,
        categories: input.categories,
      },
    });

    // Return without encrypted fields
    return this.sanitizeCard(card);
  }

  async list(companyId: string, query: ListCardsQuery) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.VirtualCardWhereInput = {
      companyId,
      ...(status && { status }),
    };

    const [cards, total] = await Promise.all([
      prisma.virtualCard.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          agentCards: {
            include: {
              agent: {
                select: { id: true, name: true }
              }
            }
          },
          _count: {
            select: { transactions: true }
          }
        }
      }),
      prisma.virtualCard.count({ where }),
    ]);

    return {
      cards: cards.map(c => this.sanitizeCard(c)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string, companyId: string) {
    const card = await prisma.virtualCard.findFirst({
      where: { id, companyId },
      include: {
        agentCards: {
          include: {
            agent: {
              select: { id: true, name: true }
            }
          }
        },
        transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { transactions: true }
        }
      }
    });

    if (!card) {
      throw new Error('Kart bulunamadı');
    }

    return this.sanitizeCard(card);
  }

  async update(id: string, companyId: string, input: UpdateCardInput) {
    const existing = await prisma.virtualCard.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new Error('Kart bulunamadı');
    }

    const card = await prisma.virtualCard.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.cardHolder !== undefined && { cardHolder: input.cardHolder }),
        ...(input.monthlyLimit !== undefined && { monthlyLimit: input.monthlyLimit }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.categories !== undefined && { categories: input.categories }),
      },
    });

    return this.sanitizeCard(card);
  }

  async delete(id: string, companyId: string) {
    const existing = await prisma.virtualCard.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new Error('Kart bulunamadı');
    }

    await prisma.virtualCard.delete({
      where: { id },
    });

    return { deleted: true };
  }

  async freeze(id: string, companyId: string) {
    return this.update(id, companyId, { status: 'FROZEN' });
  }

  async unfreeze(id: string, companyId: string) {
    return this.update(id, companyId, { status: 'ACTIVE' });
  }

  // ═══════════════════════════════════════════
  // AGENT CARD ASSIGNMENT
  // ═══════════════════════════════════════════

  async assignToAgent(companyId: string, input: AssignCardInput) {
    // Verify card belongs to company
    const card = await prisma.virtualCard.findFirst({
      where: { id: input.cardId, companyId },
    });

    if (!card) {
      throw new Error('Kart bulunamadı');
    }

    // Verify agent belongs to company
    const agent = await prisma.agent.findFirst({
      where: { id: input.agentId, companyId },
    });

    if (!agent) {
      throw new Error('Agent bulunamadı');
    }

    // Check if already assigned
    const existing = await prisma.agentCard.findFirst({
      where: { agentId: input.agentId, cardId: input.cardId },
    });

    if (existing) {
      throw new Error('Bu kart zaten bu agent\'a atanmış');
    }

    const agentCard = await prisma.agentCard.create({
      data: {
        agentId: input.agentId,
        cardId: input.cardId,
        canSpend: input.canSpend,
        maxPerTransaction: input.maxPerTransaction,
        allowedCategories: input.allowedCategories,
      },
      include: {
        agent: { select: { id: true, name: true } },
        card: { select: { id: true, name: true, last4: true } },
      },
    });

    return agentCard;
  }

  async removeFromAgent(companyId: string, agentId: string, cardId: string) {
    // Verify ownership
    const card = await prisma.virtualCard.findFirst({
      where: { id: cardId, companyId },
    });

    if (!card) {
      throw new Error('Kart bulunamadı');
    }

    const agentCard = await prisma.agentCard.findFirst({
      where: { agentId, cardId },
    });

    if (!agentCard) {
      throw new Error('Kart bu agent\'a atanmamış');
    }

    await prisma.agentCard.delete({
      where: { id: agentCard.id },
    });

    return { deleted: true };
  }

  async getAgentCards(agentId: string, companyId: string) {
    // Verify agent belongs to company
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, companyId },
    });

    if (!agent) {
      throw new Error('Agent bulunamadı');
    }

    const agentCards = await prisma.agentCard.findMany({
      where: { agentId },
      include: {
        card: {
          select: {
            id: true,
            name: true,
            last4: true,
            monthlyLimit: true,
            spent: true,
            status: true,
            categories: true,
          }
        }
      }
    });

    return agentCards;
  }

  // ═══════════════════════════════════════════
  // CARD INFO FOR AGENT (DECRYPTED)
  // ═══════════════════════════════════════════

  /**
   * Get decrypted card info for agent to use in payment forms
   * Only returns data if agent is authorized to use this card
   */
  async getDecryptedCardForAgent(agentId: string, cardId: string, companyId: string) {
    // Get agent card assignment
    const agentCard = await prisma.agentCard.findFirst({
      where: { agentId, cardId },
      include: {
        card: true,
        agent: {
          select: { companyId: true }
        }
      }
    });

    if (!agentCard) {
      throw new Error('Bu kart bu agent\'a atanmamış');
    }

    if (agentCard.agent.companyId !== companyId) {
      throw new Error('Yetkisiz erişim');
    }

    if (!agentCard.canSpend) {
      throw new Error('Bu agent bu kartı kullanma yetkisine sahip değil');
    }

    const card = agentCard.card;

    if (card.status !== 'ACTIVE') {
      throw new Error('Kart aktif değil');
    }

    // Decrypt card data
    const cardNumber = decrypt(card.cardNumberEnc);
    const cvv = decrypt(card.cvvEnc);

    return {
      cardNumber,
      cardHolder: card.cardHolder || '',
      expiryMonth: card.expiryMonth.toString().padStart(2, '0'),
      expiryYear: (card.expiryYear % 100).toString().padStart(2, '0'),
      cvv,
      // Additional info
      name: card.name,
      last4: card.last4,
      monthlyLimit: card.monthlyLimit,
      spent: card.spent,
      remaining: card.monthlyLimit - card.spent,
      // Agent restrictions
      maxPerTransaction: agentCard.maxPerTransaction,
      allowedCategories: agentCard.allowedCategories,
    };
  }

  // ═══════════════════════════════════════════
  // TRANSACTIONS
  // ═══════════════════════════════════════════

  async createTransaction(companyId: string, input: CreateTransactionInput) {
    // Verify card
    const card = await prisma.virtualCard.findFirst({
      where: { id: input.cardId, companyId },
    });

    if (!card) {
      throw new Error('Kart bulunamadı');
    }

    if (card.status !== 'ACTIVE') {
      throw new Error('Kart aktif değil');
    }

    // Check limit
    if (card.spent + input.amount > card.monthlyLimit) {
      throw new Error(`Aylık limit aşılıyor. Kalan: $${(card.monthlyLimit - card.spent).toFixed(2)}`);
    }

    // If agent specified, check agent restrictions
    if (input.agentId) {
      const agentCard = await prisma.agentCard.findFirst({
        where: { agentId: input.agentId, cardId: input.cardId },
      });

      if (!agentCard) {
        throw new Error('Bu kart bu agent\'a atanmamış');
      }

      if (!agentCard.canSpend) {
        throw new Error('Agent bu kartı kullanma yetkisine sahip değil');
      }

      if (agentCard.maxPerTransaction && input.amount > agentCard.maxPerTransaction) {
        throw new Error(`Tek işlem limiti aşıldı. Maksimum: $${agentCard.maxPerTransaction}`);
      }

      // Check category restrictions
      if (agentCard.allowedCategories.length > 0 && input.category) {
        if (!agentCard.allowedCategories.includes(input.category)) {
          throw new Error(`Bu kategori için yetki yok: ${input.category}`);
        }
      }
    }

    // Create pending transaction
    const transaction = await prisma.cardTransaction.create({
      data: {
        cardId: input.cardId,
        agentId: input.agentId,
        sessionId: input.sessionId,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        merchant: input.merchant,
        category: input.category,
        status: 'PENDING',
      },
    });

    return transaction;
  }

  async approveTransaction(id: string, companyId: string, userId: string) {
    const tx = await prisma.cardTransaction.findFirst({
      where: { id },
      include: { card: true },
    });

    if (!tx || tx.card.companyId !== companyId) {
      throw new Error('İşlem bulunamadı');
    }

    if (tx.status !== 'PENDING') {
      throw new Error('Bu işlem zaten onaylanmış veya reddedilmiş');
    }

    // Update transaction and card spent amount
    const [transaction] = await prisma.$transaction([
      prisma.cardTransaction.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: userId,
          approvedAt: new Date(),
        },
      }),
      prisma.virtualCard.update({
        where: { id: tx.cardId },
        data: {
          spent: { increment: tx.amount },
        },
      }),
    ]);

    return transaction;
  }

  async completeTransaction(id: string, companyId: string) {
    const tx = await prisma.cardTransaction.findFirst({
      where: { id },
      include: { card: true },
    });

    if (!tx || tx.card.companyId !== companyId) {
      throw new Error('İşlem bulunamadı');
    }

    if (tx.status !== 'APPROVED') {
      throw new Error('İşlem önce onaylanmalı');
    }

    const transaction = await prisma.cardTransaction.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    return transaction;
  }

  async rejectTransaction(id: string, companyId: string) {
    const tx = await prisma.cardTransaction.findFirst({
      where: { id },
      include: { card: true },
    });

    if (!tx || tx.card.companyId !== companyId) {
      throw new Error('İşlem bulunamadı');
    }

    if (tx.status !== 'PENDING') {
      throw new Error('Bu işlem zaten işlenmiş');
    }

    const transaction = await prisma.cardTransaction.update({
      where: { id },
      data: { status: 'REJECTED' },
    });

    return transaction;
  }

  async listTransactions(companyId: string, query: ListTransactionsQuery) {
    const { page, limit, cardId, agentId, status } = query;
    const skip = (page - 1) * limit;

    // First get company's card IDs
    const companyCards = await prisma.virtualCard.findMany({
      where: { companyId },
      select: { id: true },
    });
    const cardIds = companyCards.map(c => c.id);

    const where: Prisma.CardTransactionWhereInput = {
      cardId: { in: cardIds },
      ...(cardId && { cardId }),
      ...(agentId && { agentId }),
      ...(status && { status }),
    };

    const [transactions, total] = await Promise.all([
      prisma.cardTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          card: {
            select: { id: true, name: true, last4: true }
          }
        }
      }),
      prisma.cardTransaction.count({ where }),
    ]);

    return {
      transactions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPendingTransactions(companyId: string) {
    const companyCards = await prisma.virtualCard.findMany({
      where: { companyId },
      select: { id: true },
    });
    const cardIds = companyCards.map(c => c.id);

    const transactions = await prisma.cardTransaction.findMany({
      where: {
        cardId: { in: cardIds },
        status: 'PENDING',
      },
      orderBy: { createdAt: 'asc' },
      include: {
        card: {
          select: { id: true, name: true, last4: true }
        }
      }
    });

    return transactions;
  }

  // ═══════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════

  private sanitizeCard(card: any) {
    // Remove encrypted fields, keep safe data
    const { cardNumberEnc, cvvEnc, ...safe } = card;
    return safe;
  }

  // Reset monthly spent (call via cron job)
  async resetMonthlySpent(companyId?: string) {
    const where = companyId ? { companyId } : {};
    
    await prisma.virtualCard.updateMany({
      where,
      data: { spent: 0 },
    });

    return { reset: true };
  }
}

export const cardsService = new CardsService();
