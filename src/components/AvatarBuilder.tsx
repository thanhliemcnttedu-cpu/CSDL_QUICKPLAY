import { useEffect, useState } from 'react';
import { Check, ChevronDown, PawPrint, Shuffle, Users, X } from 'lucide-react';
import {
  ACCESSORIES, ANIMALS, FACES, HAIR_COLOR_NAMES, HAIR_COLORS, HAIR_STYLES, PRESET_KIDS, SHIRT_NAMES, SHIRTS, SKIN_NAMES, SKINS,
  decodeAvatar, describeAvatarValue, encodeAvatar, isAnimal, randomAnimal, randomAvatar, type AvatarCfg, type Gender,
} from '../lib/avatar';
import { sfx } from '../lib/sound';
import { Avatar, AvatarSvg } from './Avatar';
import '../avatar.css';

/** Hộp chọn nhân vật: hai nhóm "Bạn học sinh" và "Con vật"; chữ to, ô bấm to, bấm là chọn ngay. */
export function AvatarBuilder({ value, onDone, onClose }: { value?: string; onDone: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState<string>(() => (decodeAvatar(value) || isAnimal(value) ? value! : encodeAvatar(randomAvatar())));
  const [tab, setTab] = useState<'kid' | 'animal'>(() => (isAnimal(value) ? 'animal' : 'kid'));
  const [custom, setCustom] = useState(false);
  // Cấu hình dùng cho phần "Tự phối đồ" (khi đang chọn con vật thì bắt đầu từ một bạn ngẫu nhiên)
  const c: AvatarCfg = decodeAvatar(v) ?? decodeAvatar(PRESET_KIDS[0].value)!;
  const pick = (next: string) => {
    sfx.pop();
    setV(next);
  };
  const set = (p: Partial<AvatarCfg>) => pick(encodeAvatar({ ...c, ...p }));
  const setGender = (g: Gender) => set({ gender: g, hair: 0, acc: c.acc === 3 && g === 'm' ? 0 : c.acc });
  const surprise = () => {
    sfx.whoosh();
    setV(tab === 'animal' ? randomAnimal() : encodeAvatar(randomAvatar()));
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const isKid = !!decodeAvatar(v);
  // Khi đang chọn con vật thì chưa có lựa chọn nào trong phần tự phối đồ được đánh dấu
  const Tile = ({ on: sel, onClick, label, preview }: { on: boolean; onClick: () => void; label: string; preview: AvatarCfg }) => {
    const on = sel && isKid;
    return (
    <button type="button" className={`av-tile ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>
      <AvatarSvg c={preview} size={64} />
      <span>{label}</span>
      {on && <Check size={16} className="av-check" />}
    </button>
    );
  };
  const Swatches = ({ colors, names, cur, pick: choose }: { colors: string[]; names: string[]; cur: number; pick: (i: number) => void }) => (
    <div className="av-swatches">
      {colors.map((col, i) => (
        <button key={col} type="button" className={`av-sw ${cur === i ? 'on' : ''}`} aria-pressed={cur === i} aria-label={names[i]} onClick={() => choose(i)}>
          <span style={{ background: col }}>{cur === i && <Check size={18} color="#fff" />}</span>
          <small>{names[i]}</small>
        </button>
      ))}
    </div>
  );

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="av-builder" role="dialog" aria-modal="true" aria-label="Chọn nhân vật của em">
        <div className="av-preview">
          <Avatar value={v} size={168} label />
          <p className="small" style={{ margin: 0, textAlign: 'center' }}>{describeAvatarValue(v)}</p>
          <button type="button" className="btn accent" onClick={surprise}><Shuffle size={18} /> Bất ngờ!</button>
          <button type="button" className="btn primary lg" onClick={() => (sfx.join(), onDone(v))}><Check size={20} /> Xong</button>
        </div>
        <div className="av-options">
          <div className="row between">
            <h2 style={{ margin: 0 }}>Chọn nhân vật của em</h2>
            <button className="btn icon ghost" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
          </div>

          <div className="avx-tabs" role="tablist" aria-label="Nhóm nhân vật">
            <button type="button" role="tab" aria-selected={tab === 'kid'} className={tab === 'kid' ? 'on' : ''} onClick={() => setTab('kid')}><Users size={22} /> Bạn học sinh</button>
            <button type="button" role="tab" aria-selected={tab === 'animal'} className={tab === 'animal' ? 'on' : ''} onClick={() => setTab('animal')}><PawPrint size={22} /> Con vật</button>
          </div>

          {tab === 'animal' && (
            <div className="avx-grid" role="group" aria-label="Các bạn thú">
              {ANIMALS.map((a) => (
                <button key={a.key} type="button" className={`avx-cell ${v === a.key ? 'on' : ''}`} aria-pressed={v === a.key} aria-label={a.name} onClick={() => pick(a.key)}>
                  <Avatar value={a.key} size={72} />
                  <span>{a.name}</span>
                  {v === a.key && <Check size={16} className="av-check" />}
                </button>
              ))}
            </div>
          )}

          {tab === 'kid' && (
            <>
              <div className="avx-grid" role="group" aria-label="Các bạn học sinh">
                {PRESET_KIDS.map((k) => (
                  <button key={k.value} type="button" className={`avx-cell ${v === k.value ? 'on' : ''}`} aria-pressed={v === k.value} aria-label={k.name} onClick={() => pick(k.value)}>
                    <Avatar value={k.value} size={72} />
                    <span>{k.value.startsWith('v2-f') ? 'Bạn nữ' : 'Bạn nam'}</span>
                    {v === k.value && <Check size={16} className="av-check" />}
                  </button>
                ))}
              </div>
              <button type="button" className="btn ghost avx-more" aria-expanded={custom} onClick={() => setCustom((x) => !x)}>
                <ChevronDown size={18} style={{ transform: custom ? 'rotate(180deg)' : undefined }} /> {custom ? 'Thu gọn phần tự phối đồ' : 'Tự phối đồ: tóc, da, áo, phụ kiện, nét mặt'}
              </button>
              {custom && (
                <>
                  <section>
                    <h3>1. Em là</h3>
                    <div className="av-row">
                      <Tile on={c.gender === 'm'} onClick={() => setGender('m')} label="Bạn nam" preview={{ ...c, gender: 'm', hair: c.gender === 'm' ? c.hair : 0, acc: 0 }} />
                      <Tile on={c.gender === 'f'} onClick={() => setGender('f')} label="Bạn nữ" preview={{ ...c, gender: 'f', hair: c.gender === 'f' ? c.hair : 0, acc: 0 }} />
                    </div>
                  </section>
                  <section>
                    <h3>2. Kiểu tóc và màu tóc</h3>
                    <div className="av-row">
                      {HAIR_STYLES[c.gender].map((name, i) => (
                        <Tile key={name} on={c.hair === i} onClick={() => set({ hair: i })} label={name} preview={{ ...c, hair: i, acc: 0 }} />
                      ))}
                    </div>
                    <Swatches colors={HAIR_COLORS} names={HAIR_COLOR_NAMES} cur={c.hairColor} pick={(i) => set({ hairColor: i })} />
                  </section>
                  <section>
                    <h3>3. Màu da</h3>
                    <Swatches colors={SKINS} names={SKIN_NAMES} cur={c.skin} pick={(i) => set({ skin: i })} />
                  </section>
                  <section>
                    <h3>4. Màu áo</h3>
                    <Swatches colors={SHIRTS} names={SHIRT_NAMES} cur={c.shirt} pick={(i) => set({ shirt: i })} />
                  </section>
                  <section>
                    <h3>5. Phụ kiện</h3>
                    <div className="av-row">
                      {ACCESSORIES.map((name, i) => (
                        <Tile key={name} on={c.acc === i} onClick={() => set({ acc: i })} label={name} preview={{ ...c, acc: i }} />
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3>6. Nét mặt</h3>
                    <div className="av-row">
                      {FACES.map((name, i) => (
                        <Tile key={name} on={c.face === i} onClick={() => set({ face: i })} label={name} preview={{ ...c, face: i }} />
                      ))}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
