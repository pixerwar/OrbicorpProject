import { PrismaClient, PackageType, PricingModel, PackageStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// SEED PACKAGES
// ==========================================

const seedPackages = [
  // ==========================================
  // CORE SKILLS (Resmi Orbicorp paketleri)
  // ==========================================
  {
    name: 'memory-tools',
    version: '1.0.0',
    type: 'SKILL' as PackageType,
    displayName: 'Hafıza Araçları',
    description: 'Agent\'a kullanıcılar ve konuşmalar hakkında bilgi hatırlama, anımsama ve unutma yetenekleri kazandırır.',
    icon: '🧠',
    category: 'core',
    tags: ['memory', 'hafıza', 'hatırlama', 'database'],
    authorName: 'Orbicorp',
    authorEmail: 'dev@orbicorp.ai',
    pricingModel: 'FREE' as PricingModel,
    price: 0,
    providers: ['anthropic', 'openai', 'google'],
    permissions: ['database.agentMemory.read', 'database.agentMemory.write'],
    tools: [
      {
        name: 'remember',
        description: 'Kullanıcı hakkında önemli bir bilgiyi kalıcı olarak hafızaya kaydet. Tercihler, önemli tarihler, isimler gibi bilgiler için kullan.',
        parameters: {
          type: 'object',
          properties: {
            fact: {
              type: 'string',
              description: 'Hatırlanacak bilgi (örn: "Kullanıcının adı Ahmet", "Kahve içmeyi seviyor")'
            },
            category: {
              type: 'string',
              enum: ['FACT', 'PREFERENCE', 'LEARNING'],
              description: 'Bilgi kategorisi: FACT (gerçek), PREFERENCE (tercih), LEARNING (öğrenilen)'
            }
          },
          required: ['fact']
        },
        handler: 'builtin:memory.remember'
      },
      {
        name: 'recall',
        description: 'Hafızadan bilgi ara ve getir. Kullanıcı hakkında daha önce öğrenilen bilgileri hatırlamak için kullan.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Aranacak konu veya anahtar kelime'
            },
            category: {
              type: 'string',
              enum: ['FACT', 'PREFERENCE', 'LEARNING'],
              description: 'Sadece belirli kategoride ara (opsiyonel)'
            }
          },
          required: ['query']
        },
        handler: 'builtin:memory.recall'
      },
      {
        name: 'forget',
        description: 'Hafızadan belirli bir bilgiyi sil. Kullanıcı istediğinde veya bilgi artık geçerli değilse kullan.',
        parameters: {
          type: 'object',
          properties: {
            memoryId: {
              type: 'string',
              description: 'Silinecek hafıza kaydının ID\'si'
            }
          },
          required: ['memoryId']
        },
        handler: 'builtin:memory.forget'
      }
    ],
    manifest: {
      systemPromptAddition: 'Kullanıcı hakkında önemli bilgileri (isim, tercihler, önemli tarihler) "remember" tool\'u ile kaydet. Konuşma başında "recall" ile kullanıcı hakkında bildiklerini hatırla.'
    },
    configSchema: {},
    isOfficial: true,
    isVerified: true,
    status: 'PUBLISHED' as PackageStatus,
  },
  {
    name: 'multi-agent',
    version: '1.0.0',
    type: 'SKILL' as PackageType,
    displayName: 'Çoklu Agent Yönetimi',
    description: 'Diğer agent\'ları listeleme, soru sorma, görev devretme ve yeni agent oluşturma yetenekleri. Sadece Main Agent kullanabilir.',
    icon: '🤖',
    category: 'core',
    tags: ['multi-agent', 'delegation', 'orchestration', 'agent'],
    authorName: 'Orbicorp',
    authorEmail: 'dev@orbicorp.ai',
    pricingModel: 'FREE' as PricingModel,
    price: 0,
    providers: ['anthropic', 'openai', 'google'],
    permissions: ['agents.read', 'agents.write', 'agents.execute'],
    tools: [
      {
        name: 'list_agents',
        description: 'Şirketteki tüm mevcut agent\'ları listele. Her agent\'ın adı, uzmanlık alanı ve durumunu gösterir.',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['ACTIVE', 'INACTIVE', 'ALL'],
              description: 'Filtreleme: sadece aktif, pasif veya tümü'
            }
          }
        },
        handler: 'builtin:agents.list'
      },
      {
        name: 'ask_agent',
        description: 'Başka bir agent\'a soru sor ve cevabını al. Uzmanlık gerektiren konularda ilgili agent\'a danış.',
        parameters: {
          type: 'object',
          properties: {
            agentId: {
              type: 'string',
              description: 'Soru sorulacak agent\'ın ID\'si'
            },
            question: {
              type: 'string',
              description: 'Sorulacak soru'
            }
          },
          required: ['agentId', 'question']
        },
        handler: 'builtin:agents.ask'
      },
      {
        name: 'delegate_task',
        description: 'Bir görevi başka bir agent\'a devret. Uzun süreli veya uzmanlık gerektiren işler için kullan.',
        parameters: {
          type: 'object',
          properties: {
            agentId: {
              type: 'string',
              description: 'Görevin devredileceği agent\'ın ID\'si'
            },
            taskName: {
              type: 'string',
              description: 'Görev adı'
            },
            taskDescription: {
              type: 'string',
              description: 'Detaylı görev açıklaması'
            },
            priority: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
              description: 'Görev önceliği'
            }
          },
          required: ['agentId', 'taskName', 'taskDescription']
        },
        handler: 'builtin:agents.delegate'
      },
      {
        name: 'create_agent',
        description: 'Yeni bir uzman agent oluştur. Belirli bir alan için özelleşmiş agent gerektiğinde kullan.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Yeni agent\'ın adı'
            },
            description: {
              type: 'string',
              description: 'Agent\'ın uzmanlık alanı ve görevi'
            },
            systemPrompt: {
              type: 'string',
              description: 'Agent\'ın davranışını belirleyen sistem promptu'
            },
            department: {
              type: 'string',
              description: 'Departman (HR, IT, Sales, vb.)'
            }
          },
          required: ['name', 'description', 'systemPrompt']
        },
        handler: 'builtin:agents.create'
      }
    ],
    manifest: {
      systemPromptAddition: 'Karmaşık görevlerde diğer agent\'lara danış veya görev devret. "list_agents" ile mevcut uzman agent\'ları gör.',
      restrictions: {
        onlyMainAgent: true,
        description: 'Bu skill sadece Main Agent tarafından kullanılabilir'
      }
    },
    configSchema: {},
    isOfficial: true,
    isVerified: true,
    status: 'PUBLISHED' as PackageStatus,
  },
  
  // ==========================================
  // PRODUCTIVITY SKILLS
  // ==========================================
  {
    name: 'task-manager',
    version: '1.0.0',
    type: 'SKILL' as PackageType,
    displayName: 'Görev Yönetimi',
    description: 'Görev oluşturma, listeleme, güncelleme ve tamamlama yetenekleri. Workflow entegrasyonu.',
    icon: '✅',
    category: 'productivity',
    tags: ['task', 'görev', 'todo', 'workflow'],
    authorName: 'Orbicorp',
    authorEmail: 'dev@orbicorp.ai',
    pricingModel: 'FREE' as PricingModel,
    price: 0,
    providers: ['anthropic', 'openai', 'google'],
    permissions: ['tasks.read', 'tasks.write'],
    tools: [
      {
        name: 'create_task',
        description: 'Yeni bir görev oluştur.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Görev adı' },
            description: { type: 'string', description: 'Görev açıklaması' },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
            assigneeId: { type: 'string', description: 'Atanacak agent ID (opsiyonel)' }
          },
          required: ['name']
        },
        handler: 'builtin:tasks.create'
      },
      {
        name: 'list_tasks',
        description: 'Görevleri listele.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'ALL'] },
            limit: { type: 'number', description: 'Maksimum sonuç sayısı' }
          }
        },
        handler: 'builtin:tasks.list'
      },
      {
        name: 'update_task',
        description: 'Görev durumunu güncelle.',
        parameters: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Görev ID' },
            status: { type: 'string', enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] },
            progress: { type: 'number', description: '0-100 arası ilerleme' }
          },
          required: ['taskId']
        },
        handler: 'builtin:tasks.update'
      }
    ],
    manifest: {
      systemPromptAddition: 'Görevleri yönetmek için task tool\'larını kullan. Kullanıcı bir iş istediğinde görev oluştur ve takip et.'
    },
    configSchema: {},
    isOfficial: true,
    isVerified: true,
    status: 'PUBLISHED' as PackageStatus,
  },
  {
    name: 'calculator',
    version: '1.0.0',
    type: 'TOOL' as PackageType,
    displayName: 'Hesap Makinesi',
    description: 'Matematik hesaplamaları yapma yeteneği. Temel aritmetik, yüzde, kök, üs hesaplamaları.',
    icon: '🧮',
    category: 'productivity',
    tags: ['calculator', 'math', 'hesap', 'matematik'],
    authorName: 'Orbicorp',
    authorEmail: 'dev@orbicorp.ai',
    pricingModel: 'FREE' as PricingModel,
    price: 0,
    providers: ['anthropic', 'openai', 'google'],
    permissions: [],
    tools: [
      {
        name: 'calculate',
        description: 'Matematik ifadesi hesapla. Temel aritmetik, parantez, yüzde, kök ve üs destekler.',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Hesaplanacak ifade (örn: "2 + 2", "sqrt(16)", "10% of 500", "2^8")'
            }
          },
          required: ['expression']
        },
        handler: 'builtin:math.calculate'
      }
    ],
    manifest: {
      systemPromptAddition: 'Matematiksel hesaplamalar için "calculate" tool\'unu kullan.'
    },
    configSchema: {},
    isOfficial: true,
    isVerified: true,
    status: 'PUBLISHED' as PackageStatus,
  },

  // ==========================================
  // AGENT TEMPLATES
  // ==========================================
  {
    name: 'hr-assistant-template',
    version: '1.0.0',
    type: 'AGENT_TEMPLATE' as PackageType,
    displayName: 'İK Asistan Şablonu',
    description: 'İnsan kaynakları departmanı için hazır agent şablonu. İşe alım, izin yönetimi, performans değerlendirme.',
    icon: '👔',
    category: 'productivity',
    tags: ['hr', 'insan kaynakları', 'işe alım', 'izin', 'personel'],
    authorName: 'Orbicorp',
    authorEmail: 'dev@orbicorp.ai',
    pricingModel: 'FREE' as PricingModel,
    price: 0,
    providers: ['anthropic', 'openai', 'google'],
    permissions: [],
    tools: [],
    manifest: {
      agentTemplate: {
        name: 'İK Asistanı',
        description: 'İnsan kaynakları süreçlerini yöneten uzman agent',
        department: 'HR',
        systemPrompt: `Sen şirketin İnsan Kaynakları Asistanısın.

GÖREVLERİN:
- İşe alım süreçlerini takip et
- İzin taleplerini değerlendir
- Personel sorularını yanıtla
- Performans değerlendirme süreçlerinde destek ol
- Bordro ve yan haklar hakkında bilgi ver

DAVRANIŞ KURALLARI:
- Gizlilik ilkesine uy, kişisel bilgileri paylaşma
- Yasal düzenlemelere uygun tavsiyelerde bulun
- Empati ile yaklaş, çalışan memnuniyetini önemse
- Karmaşık konularda İK yöneticisine yönlendir`,
        suggestedModel: {
          provider: 'anthropic',
          modelId: 'claude-3-5-sonnet-20241022'
        },
        temperature: 0.7,
        skills: ['memory-tools'],
      }
    },
    configSchema: {},
    isOfficial: true,
    isVerified: true,
    status: 'PUBLISHED' as PackageStatus,
  },
  {
    name: 'sales-assistant-template',
    version: '1.0.0',
    type: 'AGENT_TEMPLATE' as PackageType,
    displayName: 'Satış Asistan Şablonu',
    description: 'Satış ekibi için hazır agent şablonu. Müşteri takibi, teklif hazırlama, CRM entegrasyonu.',
    icon: '💼',
    category: 'productivity',
    tags: ['sales', 'satış', 'crm', 'müşteri', 'teklif'],
    authorName: 'Orbicorp',
    authorEmail: 'dev@orbicorp.ai',
    pricingModel: 'FREE' as PricingModel,
    price: 0,
    providers: ['anthropic', 'openai', 'google'],
    permissions: [],
    tools: [],
    manifest: {
      agentTemplate: {
        name: 'Satış Asistanı',
        description: 'Satış süreçlerini destekleyen uzman agent',
        department: 'Sales',
        systemPrompt: `Sen şirketin Satış Asistanısın.

GÖREVLERİN:
- Müşteri bilgilerini takip et
- Teklif taslakları hazırla
- Satış fırsatlarını değerlendir
- Müşteri sorularına hızlı yanıt ver
- Satış raporları oluştur

DAVRANIŞ KURALLARI:
- Müşteri odaklı ol
- Rakip bilgilerini dikkatli paylaş
- Fiyat ve indirim konularında yöneticiye danış
- İkna edici ama dürüst ol`,
        suggestedModel: {
          provider: 'anthropic',
          modelId: 'claude-3-5-sonnet-20241022'
        },
        temperature: 0.8,
        skills: ['memory-tools', 'task-manager'],
      }
    },
    configSchema: {},
    isOfficial: true,
    isVerified: true,
    status: 'PUBLISHED' as PackageStatus,
  },

  // ==========================================
  // LANGUAGE PACKS
  // ==========================================
  {
    name: 'lang-en',
    version: '1.0.0',
    type: 'LANGUAGE_PACK' as PackageType,
    displayName: 'English',
    description: 'English language pack for Orbicorp interface.',
    icon: '🇬🇧',
    category: 'core',
    tags: ['language', 'english', 'en', 'dil'],
    authorName: 'Orbicorp',
    authorEmail: 'dev@orbicorp.ai',
    pricingModel: 'FREE' as PricingModel,
    price: 0,
    providers: [],
    permissions: [],
    tools: [],
    manifest: {
      translations: {
        locale: 'en',
        name: 'English',
        strings: {
          'common.save': 'Save',
          'common.cancel': 'Cancel',
          'common.delete': 'Delete',
          'common.edit': 'Edit',
          'common.create': 'Create',
          'common.search': 'Search',
          'nav.dashboard': 'Dashboard',
          'nav.agents': 'Agents',
          'nav.chat': 'Chat',
          'nav.tasks': 'Tasks',
          'nav.market': 'Market',
        }
      }
    },
    configSchema: {},
    isOfficial: true,
    isVerified: true,
    status: 'PUBLISHED' as PackageStatus,
  },
  {
    name: 'lang-de',
    version: '1.0.0',
    type: 'LANGUAGE_PACK' as PackageType,
    displayName: 'Deutsch',
    description: 'German language pack for Orbicorp interface.',
    icon: '🇩🇪',
    category: 'core',
    tags: ['language', 'german', 'deutsch', 'de', 'dil'],
    authorName: 'Community',
    authorEmail: 'community@orbicorp.ai',
    pricingModel: 'FREE' as PricingModel,
    price: 0,
    providers: [],
    permissions: [],
    tools: [],
    manifest: {
      translations: {
        locale: 'de',
        name: 'Deutsch',
        strings: {
          'common.save': 'Speichern',
          'common.cancel': 'Abbrechen',
          'common.delete': 'Löschen',
          'common.edit': 'Bearbeiten',
          'common.create': 'Erstellen',
          'common.search': 'Suchen',
          'nav.dashboard': 'Dashboard',
          'nav.agents': 'Agenten',
          'nav.chat': 'Chat',
          'nav.tasks': 'Aufgaben',
          'nav.market': 'Marktplatz',
        }
      }
    },
    configSchema: {},
    isOfficial: false,
    isVerified: true,
    status: 'PUBLISHED' as PackageStatus,
  },
];

// ==========================================
// SEED FUNCTION
// ==========================================

async function seedMarketPackages() {
  console.log('🌱 Seeding market packages...');

  for (const pkg of seedPackages) {
    const existing = await prisma.marketPackage.findUnique({
      where: { name: pkg.name },
    });

    if (existing) {
      console.log(`  ⏭️  Package "${pkg.name}" already exists, skipping...`);
      continue;
    }

    await prisma.marketPackage.create({
      data: {
        ...pkg,
        publishedAt: new Date(),
      },
    });

    console.log(`  ✅ Created package: ${pkg.displayName}`);
  }

  console.log('✅ Market packages seeded successfully!');
}

// ==========================================
// MAIN
// ==========================================

async function main() {
  try {
    await seedMarketPackages();
  } catch (error) {
    console.error('❌ Seed error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
