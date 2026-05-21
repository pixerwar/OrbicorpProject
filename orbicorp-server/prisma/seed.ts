import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo company
  const company = await prisma.company.upsert({
    where: { slug: 'novatech' },
    update: {},
    create: {
      name: 'NovaTech Solutions A.Ş.',
      slug: 'novatech',
      settings: {
        timezone: 'Europe/Istanbul',
        language: 'tr',
        theme: 'light',
      },
    },
  });
  console.log(`✅ Company: ${company.name}`);

  // Create admin user
  const passwordHash = await bcrypt.hash('admin123', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@novatech.com.tr' },
    update: {},
    create: {
      companyId: company.id,
      email: 'admin@novatech.com.tr',
      passwordHash,
      firstName: 'Ahmet',
      lastName: 'Yılmaz',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Admin user: ${adminUser.email}`);

  // Create Main Agent (default for every company)
  const mainAgent = await prisma.agent.upsert({
    where: { id: `${company.id}-main-agent` },
    update: {},
    create: {
      id: `${company.id}-main-agent`,
      companyId: company.id,
      name: 'Main Agent',
      description: 'Şirketinizin ana AI asistanı. Tüm konularda yardımcı olur.',
      department: 'Genel',
      isMain: true,
      modelProvider: null,  // Yapılandırılmamış - kullanıcı ayarlamalı
      modelId: null,
      systemPrompt: 'Sen NovaTech Solutions şirketinin ana AI asistanısın. Çalışanlara her konuda yardımcı ol, sorularını yanıtla, görevlerde destek sağla. Türkçe yanıt ver.',
      channels: ['webchat'],
      status: 'ACTIVE',
      temperature: 0.7,
      maxTokens: 2000,
      stats: {
        totalChats: 0,
        successRate: 0,
        avgResponseTime: 0,
      },
    },
  });
  console.log(`✅ Main Agent: ${mainAgent.name}`);

  // Create demo skills in marketplace
  const skills = [
    { name: 'Invoice Reader', slug: 'invoice-reader', category: 'Automation', priceMonthly: 29 },
    { name: 'Email Composer', slug: 'email-composer', category: 'Productivity', priceMonthly: 19 },
    { name: 'Data Extractor', slug: 'data-extractor', category: 'Analytics', priceMonthly: 49 },
    { name: 'Meeting Scheduler', slug: 'meeting-scheduler', category: 'Productivity', priceMonthly: 19 },
    { name: 'Contract Analyzer', slug: 'contract-analyzer', category: 'Legal', priceMonthly: 79 },
  ];

  for (const skill of skills) {
    await prisma.skill.upsert({
      where: { slug: skill.slug },
      update: {},
      create: {
        ...skill,
        description: `${skill.name} - AI powered skill for your agents`,
        version: '1.0.0',
        author: 'Orbicorp',
        definition: { prompts: [], tools: [], config: {} },
      },
    });
    console.log(`✅ Skill: ${skill.name}`);
  }

  // Create demo workflows
  const invoiceWorkflow = await prisma.workflow.upsert({
    where: { id: `${company.id}-workflow-invoice` },
    update: {},
    create: {
      id: `${company.id}-workflow-invoice`,
      companyId: company.id,
      name: 'Fatura İşleme Otomasyonu',
      description: 'Gelen fatura e-postalarını otomatik işler ve sisteme kaydeder',
      icon: '⚡',
      status: 'ACTIVE',
      runCount: 47,
      lastRunAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 saat önce
      definition: {
        nodes: [
          { id: 1, type: 'trigger', x: 80, y: 180, label: 'E-posta Tetikleyici', config: { triggerType: 'E-posta geldiğinde', filter: 'Konu: "fatura" içeriyorsa' } },
          { id: 2, type: 'agent', x: 280, y: 180, label: 'PDF Parse', config: { agent: 'Data Analyst', instruction: 'Fatura PDF\'inden veri çıkar' } },
          { id: 3, type: 'condition', x: 480, y: 180, label: 'Tutar Kontrolü', config: { expr: 'tutar > 5000' } },
          { id: 4, type: 'approval', x: 680, y: 100, label: 'Yönetici Onayı', config: { approver: 'Yönetici', timeout: '24 saat' } },
          { id: 5, type: 'integration', x: 680, y: 260, label: 'ERP Kayıt', config: { service: 'SAP ERP', action: 'Veri yaz' } },
          { id: 6, type: 'notification', x: 880, y: 180, label: 'Bildirim Gönder', config: { channel: 'Slack', recipient: '#finans' } },
        ],
        connections: [
          { from: 1, to: 2 },
          { from: 2, to: 3 },
          { from: 3, to: 4, label: 'Evet' },
          { from: 3, to: 5, label: 'Hayır' },
          { from: 4, to: 5 },
          { from: 5, to: 6 },
        ],
      },
    },
  });
  console.log(`✅ Workflow: ${invoiceWorkflow.name}`);

  const onboardingWorkflow = await prisma.workflow.upsert({
    where: { id: `${company.id}-workflow-onboarding` },
    update: {},
    create: {
      id: `${company.id}-workflow-onboarding`,
      companyId: company.id,
      name: 'Çalışan Onboarding Süreci',
      description: 'Yeni çalışanlar için otomatik onboarding akışı',
      icon: '👤',
      status: 'ACTIVE',
      runCount: 12,
      lastRunAt: new Date(Date.now() - 30 * 60 * 1000), // 30 dk önce
      definition: {
        nodes: [
          { id: 1, type: 'trigger', x: 80, y: 180, label: 'HR Tetikleyici', config: { triggerType: 'Manuel' } },
          { id: 2, type: 'agent', x: 280, y: 180, label: 'Hoş Geldin Mesajı', config: { agent: 'HR Assistant' } },
          { id: 3, type: 'integration', x: 480, y: 180, label: 'IT Hesapları', config: { service: 'Jira', action: 'Ticket oluştur' } },
          { id: 4, type: 'notification', x: 680, y: 180, label: 'Ekip Bildirimi', config: { channel: 'Slack' } },
        ],
        connections: [
          { from: 1, to: 2 },
          { from: 2, to: 3 },
          { from: 3, to: 4 },
        ],
      },
    },
  });
  console.log(`✅ Workflow: ${onboardingWorkflow.name}`);

  // Create demo tasks
  const tasks = [
    {
      id: `${company.id}-task-1`,
      name: 'Google Ads kampanya optimizasyonu',
      description: 'Aktif Google Ads kampanyalarının bütçe ve hedefleme optimizasyonu',
      priority: 'HIGH' as const,
      status: 'RUNNING' as const,
      progress: 60,
      agentId: mainAgent.id,
      startedAt: new Date(Date.now() - 20 * 60 * 1000),
      steps: [
        { id: 1, name: 'Kampanya verilerini çek', status: 'done', startedAt: new Date().toISOString() },
        { id: 2, name: 'Performans analizi', status: 'done' },
        { id: 3, name: 'Bütçe yeniden dağıt', status: 'running' },
        { id: 4, name: 'A/B test önerileri', status: 'pending' },
        { id: 5, name: 'Rapor gönder', status: 'pending' },
      ],
      logs: [
        { timestamp: new Date().toISOString(), level: 'info', message: 'Kampanya verileri çekiliyor... 12 aktif kampanya bulundu' },
        { timestamp: new Date().toISOString(), level: 'info', message: 'Performans analizi: 3 kampanya düşük ROAS (<1.2)' },
      ],
    },
    {
      id: `${company.id}-task-2`,
      name: 'Haftalık satış raporu oluştur',
      description: 'CRM ve fatura verilerinden haftalık satış özeti',
      priority: 'MEDIUM' as const,
      status: 'COMPLETED' as const,
      progress: 100,
      agentId: mainAgent.id,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 30 * 60 * 1000),
      steps: [
        { id: 1, name: 'CRM verilerini topla', status: 'done' },
        { id: 2, name: 'Fatura verilerini eşleştir', status: 'done' },
        { id: 3, name: 'Rapor oluştur', status: 'done' },
        { id: 4, name: 'E-posta ile gönder', status: 'done' },
      ],
      logs: [
        { timestamp: new Date().toISOString(), level: 'info', message: 'CRM bağlantısı kuruldu. 147 yeni fırsat çekildi' },
        { timestamp: new Date().toISOString(), level: 'info', message: '✓ Rapor 5 alıcıya gönderildi' },
      ],
    },
    {
      id: `${company.id}-task-3`,
      name: 'Müşteri şikayet analizi',
      description: 'Kritik müşteri şikayetlerini analiz et ve yanıt taslağı hazırla',
      priority: 'CRITICAL' as const,
      status: 'APPROVAL' as const,
      progress: 75,
      workflowId: invoiceWorkflow.id,
      startedAt: new Date(Date.now() - 45 * 60 * 1000),
      steps: [
        { id: 1, name: 'Şikayet e-postalarını oku', status: 'done' },
        { id: 2, name: 'Kategorize et', status: 'done' },
        { id: 3, name: 'Yanıt taslakları hazırla', status: 'approval-needed' },
        { id: 4, name: 'Yanıtları gönder', status: 'pending' },
      ],
      logs: [
        { timestamp: new Date().toISOString(), level: 'info', message: '12 yeni şikayet e-postası okundu' },
        { timestamp: new Date().toISOString(), level: 'warn', message: '⚠ 3 yanıt taslağı ONAY BEKLİYOR' },
      ],
    },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {},
      create: {
        id: task.id,
        companyId: company.id,
        workflowId: task.workflowId || null,
        agentId: task.agentId || null,
        name: task.name,
        description: task.description,
        priority: task.priority,
        status: task.status,
        progress: task.progress,
        steps: task.steps,
        logs: task.logs,
        startedAt: task.startedAt,
        completedAt: task.completedAt || null,
      },
    });
    console.log(`✅ Task: ${task.name}`);
  }

  console.log('\n✨ Seeding completed!');
  console.log('\n📋 Demo credentials:');
  console.log('   Email:    admin@novatech.com.tr');
  console.log('   Password: admin123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
