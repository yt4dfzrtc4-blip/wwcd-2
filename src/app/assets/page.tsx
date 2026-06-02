'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Asset, Account, Bank, AssetCategory, LivretMode } from '@/types'
import Topbar from '@/components/layout/Topbar'
import { CATEGORY_LABELS, getCategoryLabel, getCategoryBadgeClass } from '@/lib/portfolio'
import { Plus, Pencil, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react'

export default function AssetsPage() {
  const supabase = createClient()
  const [assets, setAssets] = useState<Asset[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [privacy, setPrivacy] = useState(false)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [showBankModal, setShowBankModal] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [editBank, setEditBank] = useState<Bank | null>(null)
  const [expandedBanks, setExpandedBanks] = useState<Record<string, boolean>>({})
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function loadData() {
    const [{ data: ast }, { data: acc }, { data: bnk }] = await Promise.all([
      supabase.from('assets').select('*, prices(*)').order('name'),
      supabase.from('accounts').select('*, bank:banks(*)').order('name'),
      supabase.from('banks').select('*').order('name'),
    ])
    setAssets((ast ?? []) as Asset[])
    setAccounts((acc ?? []) as Account[])
    setBanks((bnk ?? []) as Bank[])
    const expanded: Record<string, boolean> = {}
    ;(bnk ?? []).forEach((b: Bank) => { expanded[b.id] = true })
    expanded['none'] = true
    setExpandedBanks(expanded)
  }

  useEffect(() => { loadData() }, [])

  async function deleteAsset(id: string) {
    if (!confirm('Supprimer cet actif et toutes ses transactions ?')) return
    await supabase.from('assets').delete().eq('id', id)
    loadData()
  }

  async function deleteAccount(id: string) {
    if (!confirm('Supprimer ce compte ?')) return
    await supabase.from('accounts').delete().eq('id', id)
    loadData()
  }

  async function deleteBank(id: string) {
    if (!confirm('Supprimer cette banque ?')) return
    await supabase.from('banks').delete().eq('id', id)
    loadData()
  }

  const accountsByBank = (bankId: string | null) =>
    accounts.filter(a => bankId ? (a as any).bank_id === bankId : !(a as any).bank_id)

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar privacy={privacy} onTogglePrivacy={() => setPrivacy(p => !p)} onRefresh={async () => {}} />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 500 }}>Banques & Comptes</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setEditBank(null); setShowBankModal(true) }} style={{ ...btnStyle, background: 'var(--surface)', color: 'var(--text)', border: '0.5px solid var(--border)' }}>
                <Plus size={14} /> {mobile ? 'Banque' : 'Nouvelle banque'}
              </button>
              <button onClick={() => { setEditAccount(null); setShowAccountModal(true) }} style={btnStyle}>
                <Plus size={14} /> {mobile ? 'Compte' : 'Nouveau compte'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accountsByBank(null).length > 0 && (
              <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
                  Sans banque
                </div>
                {accountsByBank(null).map(acc => (
                  <AccountRow key={acc.id} acc={acc} onDelete={deleteAccount} onEdit={() => { setEditAccount(acc); setShowAccountModal(true) }} />
                ))}
              </div>
            )}

            {banks.map(bank => (
              <div key={bank.id} style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: expandedBanks[bank.id] ? '0.5px solid var(--border)' : 'none', background: 'var(--bg)' }}
                  onClick={() => setExpandedBanks(e => ({ ...e, [bank.id]: !e[bank.id] }))}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {expandedBanks[bank.id] ? <ChevronDown size={14} color="var(--muted)" /> : <ChevronRight size={14} color="var(--muted)" />}
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{bank.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{accountsByBank(bank.id).length} compte{accountsByBank(bank.id).length > 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEditBank(bank); setShowBankModal(true) }} style={iconBtn}><Pencil size={13} /></button>
                    <button onClick={() => deleteBank(bank.id)} style={{ ...iconBtn, color: 'var(--red)' }}><Trash2 size={13} /></button>
                  </div>
                </div>
                {expandedBanks[bank.id] && accountsByBank(bank.id).map(acc => (
                  <AccountRow key={acc.id} acc={acc} onDelete={deleteAccount} onEdit={() => { setEditAccount(acc); setShowAccountModal(true) }} />
                ))}
                {expandedBanks[bank.id] && accountsByBank(bank.id).length === 0 && (
                  <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>Aucun compte — ajoutez-en un</div>
                )}
              </div>
            ))}

            {banks.length === 0 && accounts.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '24px 0' }}>
                Commencez par créer une banque, puis un compte
              </p>
            )}
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 500 }}>Actifs</h2>
            <button onClick={() => { setEditAsset(null); setShowAssetModal(true) }} style={btnStyle}>
              <Plus size={14} /> Nouvel actif
            </button>
          </div>

          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 80px 50px' : '1fr 90px 110px 100px 50px', gap: 8, padding: '9px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
              <span>Nom</span>
              <span>{mobile ? 'Catégorie' : 'Catégorie'}</span>
              {!mobile && <span>ISIN / Ticker</span>}
              {!mobile && <span style={{ textAlign: 'right' }}>Valeur / Solde</span>}
              <span />
            </div>
            {!assets.length ? (
              <p style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun actif</p>
            ) : assets.map(a => (
              <div key={a.id}
                style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 80px 50px' : '1fr 90px 110px 100px 50px', gap: 8, padding: '10px 16px', borderBottom: '0.5px solid var(--border)', fontSize: 13, alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 500, fontSize: mobile ? 12 : 13 }}>{a.name}</span>
                    {['action','etf','crypto'].includes(a.category) && !a.ticker && (
                      <span title="Ticker manquant — cours non récupéré automatiquement" style={{
                        fontSize: 10, background: '#FAEEDA', color: '#633806',
                        padding: '1px 6px', borderRadius: 4, fontWeight: 500,
                      }}>sans cours</span>
                    )}
                  </div>
                  {!mobile && a.livret_mode === 'balance' && <span style={{ fontSize: 11, color: 'var(--muted)' }}>solde simple</span>}
                  {!mobile && a.livret_mode === 'transactions' && <span style={{ fontSize: 11, color: 'var(--muted)' }}>avec transactions</span>}
                </div>
                <span className={`badge ${getCategoryBadgeClass(a.category)}`} style={{ fontSize: mobile ? 9 : 10 }}>{getCategoryLabel(a.category)}</span>
                {!mobile && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{a.isin ?? a.ticker ?? '–'}</span>}
                {!mobile && <span style={{ textAlign: 'right', color: 'var(--muted)', filter: privacy ? 'blur(5px)' : 'none' }}>
                  {a.livret_mode === 'balance'
                    ? `${(a.livret_balance ?? 0).toLocaleString('fr-FR')} €`
                    : (a as any).prices?.price ? `${(a as any).prices.price.toFixed(2)} €` : '–'
                  }
                </span>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setEditAsset(a); setShowAssetModal(true) }} style={iconBtn}><Pencil size={13} /></button>
                  <button onClick={() => deleteAsset(a.id)} style={{ ...iconBtn, color: 'var(--red)' }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {showAssetModal && <AssetModal asset={editAsset} onClose={() => { setShowAssetModal(false); setEditAsset(null) }} onSuccess={loadData} />}
      {showAccountModal && <AccountModal banks={banks} account={editAccount} onClose={() => { setShowAccountModal(false); setEditAccount(null) }} onSuccess={loadData} />}
      {showBankModal && <BankModal bank={editBank} onClose={() => { setShowBankModal(false); setEditBank(null) }} onSuccess={loadData} />}
    </div>
  )
}

function AccountRow({ acc, onDelete, onEdit }: { acc: Account; onDelete: (id: string) => void; onEdit: () => void }) {
  const isLivret = acc.type === 'livret'
  const isCat = acc.type === 'cat'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ paddingLeft: 22, flex: 1 }}>
        <p style={{ fontWeight: 500 }}>{acc.name}</p>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{acc.type.toUpperCase()}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {isLivret && (
          <a href={`/livrets/${acc.id}`} style={{ fontSize: 12, color: 'var(--brand)', textDecoration: 'none', padding: '4px 10px', border: '0.5px solid var(--brand)', borderRadius: 6 }}>
            Gérer
          </a>
        )}
        {isCat && (
          <a href={`/cat/${acc.id}`} style={{ fontSize: 12, color: 'var(--brand)', textDecoration: 'none', padding: '4px 10px', border: '0.5px solid var(--brand)', borderRadius: 6 }}>
            Gérer
          </a>
        )}
        <button onClick={onEdit} style={iconBtn}><Pencil size={13} /></button>
        <button onClick={() => onDelete(acc.id)} style={{ ...iconBtn, color: 'var(--red)' }}><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

function BankModal({ bank, onClose, onSuccess }: { bank: Bank | null; onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const [name, setName] = useState(bank?.name ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (bank?.id) {
      await supabase.from('banks').update({ name }).eq('id', bank.id)
    } else {
      await supabase.from('banks').insert({ name, user_id: user.id })
    }
    onSuccess(); onClose()
  }

  return (
    <ModalWrap title={bank ? 'Modifier la banque' : 'Nouvelle banque'} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Nom de la banque">
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="Ex : Boursorama, CIC, Coinbase…" style={inp} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>Annuler</button>
          <button type="submit" disabled={loading} style={submitBtn}>{loading ? '…' : bank ? 'Modifier' : 'Créer'}</button>
        </div>
      </form>
    </ModalWrap>
  )
}

function AccountModal({ banks, account, onClose, onSuccess }: { banks: Bank[]; account: Account | null; onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const predefinedTypes = ['pea','cto','crypto','livret','cat','per','or','obligations','autre']
  const accountTypeIsCustom = account?.type && !predefinedTypes.includes(account.type)
  const [form, setForm] = useState({
    name: account?.name ?? '',
    type: accountTypeIsCustom ? 'autre' : (account?.type ?? 'pea'),
    bank_id: (account as any)?.bank_id ?? '',
    customType: accountTypeIsCustom ? account!.type : '',
  })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const finalType = form.type === 'autre' && form.customType ? form.customType.toLowerCase().replace(/\s+/g, '_') : form.type
    const payload = { name: form.name, type: finalType, bank_id: form.bank_id || null }
    if (account?.id) {
      await supabase.from('accounts').update(payload).eq('id', account.id)
    } else {
      await supabase.from('accounts').insert({ ...payload, user_id: user.id })
    }
    onSuccess(); onClose()
  }

  return (
    <ModalWrap title={account ? 'Modifier le compte' : 'Nouveau compte'} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Banque (optionnel)">
          <select value={form.bank_id} onChange={e => setForm(f => ({ ...f, bank_id: e.target.value }))} style={inp}>
            <option value="">Sans banque</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Nom du compte">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Ex : PEA, Livret A, Crypto…" style={inp} />
        </Field>
        <Field label="Type">
          <select value={['pea','cto','crypto','livret','cat','per','or','obligations','autre'].includes(form.type) ? form.type : 'autre'} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))} style={inp}>
            {[['pea','PEA'],['cto','Compte-titres'],['crypto','Crypto'],['livret','Livret'],['cat','CAT'],['per','PER'],['or','Or'],['obligations','Obligations'],['autre','Autre (personnalisé)']].map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {form.type === 'autre' && (
          <Field label="Type personnalisé">
            <input value={form.customType ?? ''} onChange={e => setForm(f => ({ ...f, customType: e.target.value }))} placeholder="Ex : SCPI, Crowdfunding…" style={inp} />
          </Field>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>Annuler</button>
          <button type="submit" disabled={loading} style={submitBtn}>{loading ? '…' : account ? 'Modifier' : 'Créer'}</button>
        </div>
      </form>
    </ModalWrap>
  )
}

function AssetModal({ asset, onClose, onSuccess }: { asset: Asset | null; onClose: () => void; onSuccess: () => void }) {
  const supabase = createClient()
  const predefinedCategories = ['action','etf','crypto','obligation','livret','cat','per','or','autre']
  const assetCategoryIsCustom = asset?.category && !predefinedCategories.includes(asset.category)
  const [form, setForm] = useState({
    name: asset?.name ?? '',
    category: assetCategoryIsCustom ? 'autre' : (asset?.category ?? 'etf'),
    customCategory: assetCategoryIsCustom ? asset!.category : '',
    isin: asset?.isin ?? '',
    ticker: asset?.ticker ?? '',
    currency: asset?.currency ?? 'EUR',
    livret_mode: asset?.livret_mode ?? 'auto',
    livret_balance: asset?.livret_balance?.toString() ?? '0',
    livret_rate: asset?.livret_rate?.toString() ?? '0',
    obligation_coupon: (asset as any)?.obligation_coupon?.toString() ?? '',
    obligation_frequency: (asset as any)?.obligation_frequency ?? 'annuelle',
    obligation_maturity: (asset as any)?.obligation_maturity ?? '',
    obligation_nominal: (asset as any)?.obligation_nominal?.toString() ?? '',
  })
  const [loading, setLoading] = useState(false)
  const showLivretOptions = ['livret', 'cat', 'per', 'or'].includes(form.category)
  const showObligationOptions = form.category === 'obligation'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const finalCategory = form.category === 'autre' && form.customCategory.trim()
      ? form.customCategory.trim().toLowerCase()
      : form.category
    const payload = {
      name: form.name,
      category: finalCategory,
      isin: form.isin || null,
      ticker: form.ticker || null,
      currency: form.currency,
      user_id: user.id,
      livret_mode: showLivretOptions ? form.livret_mode : 'auto',
      livret_balance: showLivretOptions && form.livret_mode === 'balance' ? parseFloat(form.livret_balance) : null,
      livret_rate: showLivretOptions ? parseFloat(form.livret_rate) : null,
      obligation_coupon: showObligationOptions && form.obligation_coupon ? parseFloat(form.obligation_coupon) : null,
      obligation_frequency: showObligationOptions ? form.obligation_frequency : null,
      obligation_maturity: showObligationOptions && form.obligation_maturity ? form.obligation_maturity : null,
      obligation_nominal: showObligationOptions && form.obligation_nominal ? parseFloat(form.obligation_nominal) : null,
    }
    if (asset?.id) {
      await supabase.from('assets').update(payload).eq('id', asset.id)
    } else {
      await supabase.from('assets').insert(payload)
    }
    onSuccess(); onClose()
  }

  return (
    <ModalWrap title={asset ? "Modifier l'actif" : 'Nouvel actif'} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Nom">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Ex: MSCI World, Livret A…" style={inp} />
        </Field>
        <Field label="Catégorie">
          <select value={Object.keys(CATEGORY_LABELS).includes(form.category) ? form.category : 'autre'} onChange={e => setForm(f => ({ ...f, category: e.target.value as any }))} style={inp}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="autre">Autre (personnalisé)</option>
          </select>
        </Field>
        {form.category === 'autre' && (
          <Field label="Catégorie personnalisée">
            <input value={(form as any).customCategory ?? ''} onChange={e => setForm(f => ({ ...f, customCategory: e.target.value } as any))} placeholder="Ex : SCPI, Forêt, Crypto-staking…" style={inp} />
          </Field>
        )}
        {showLivretOptions && (
          <Field label="Mode de gestion">
            <select value={form.livret_mode} onChange={e => setForm(f => ({ ...f, livret_mode: e.target.value as LivretMode }))} style={inp}>
              <option value="balance">Solde simple (sans transactions)</option>
              <option value="transactions">Avec historique de transactions</option>
              <option value="auto">Cours automatique (ETF/actions)</option>
            </select>
          </Field>
        )}
        {showLivretOptions && form.livret_mode === 'balance' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Solde actuel (€)">
              <input type="number" step="0.01" value={form.livret_balance} onChange={e => setForm(f => ({ ...f, livret_balance: e.target.value }))} style={inp} />
            </Field>
            <Field label="Taux (%)">
              <input type="number" step="0.01" value={form.livret_rate} onChange={e => setForm(f => ({ ...f, livret_rate: e.target.value }))} style={inp} />
            </Field>
          </div>
        )}
        {!showLivretOptions && !showObligationOptions && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="ISIN (optionnel)"><input value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value }))} placeholder="FR0011869353" style={inp} /></Field>
            <Field label="Ticker (optionnel)"><input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="CW8.PA" style={inp} /></Field>
          </div>
        )}
        {showObligationOptions && (<>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="ISIN (optionnel)"><input value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value }))} placeholder="FR0011869353" style={inp} /></Field>
            <Field label="Nominal (€)"><input type="number" step="0.01" value={form.obligation_nominal} onChange={e => setForm(f => ({ ...f, obligation_nominal: e.target.value }))} placeholder="1000" style={inp} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Taux coupon (%)"><input type="number" step="0.01" value={form.obligation_coupon} onChange={e => setForm(f => ({ ...f, obligation_coupon: e.target.value }))} placeholder="3.5" style={inp} /></Field>
            <Field label="Fréquence">
              <select value={form.obligation_frequency} onChange={e => setForm(f => ({ ...f, obligation_frequency: e.target.value }))} style={inp}>
                <option value="annuelle">Annuelle</option>
                <option value="semestrielle">Semestrielle</option>
                <option value="trimestrielle">Trimestrielle</option>
              </select>
            </Field>
          </div>
          <Field label="Date d&apos;échéance">
            <input type="date" value={form.obligation_maturity} onChange={e => setForm(f => ({ ...f, obligation_maturity: e.target.value }))} style={inp} />
          </Field>
        </>)}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>Annuler</button>
          <button type="submit" disabled={loading} style={submitBtn}>{loading ? '…' : asset ? 'Modifier' : 'Créer'}</button>
        </div>
      </form>
    </ModalWrap>
  )
}

function ModalWrap({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="fade-in" style={{ background: 'var(--surface)', borderRadius: 14, padding: '24px', width: '100%', maxWidth: 440, border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 7, border: '0.5px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-sans)' }
const btnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 7, background: 'var(--brand)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }
const cancelBtn: React.CSSProperties = { padding: '10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)' }
const submitBtn: React.CSSProperties = { padding: '10px', borderRadius: 7, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }
