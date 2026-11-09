// Chuyển file XML tờ khai 01/GTGT (HTKK, Thông tư 26/2015/TT-BTC) sang PDF ngay trên trình duyệt.
// Không gửi gì lên máy chủ và không ghi CSDL. Thư viện PDF và font chỉ được tải khi người dùng bấm "Chuyển đổi".

export const MAX_XML_BYTES = 5 * 1024 * 1024;
const NS = 'http://kekhaithue.gdt.gov.vn/TKhaiThue';

export interface Gtgt {
  period: string; periodSlug: string; first: boolean; times: string;
  name: string; mst: string; address: string; district: string; province: string; phone: string; fax: string; email: string;
  agent: { name: string; mst: string; address: string; district: string; province: string; phone: string; fax: string; email: string; contractNo: string; contractDate: string };
  staffName: string; staffCert: string; signDate: { d: string; m: string; y: string };
  ct: Record<string, number>; noActivity: boolean;
}

export class XmlError extends Error {}

const text = (root: Element | Document, name: string) => (root.getElementsByTagNameNS('*', name)[0]?.textContent ?? '').trim();
const num = (root: Element | Document, name: string) => { const n = Number(text(root, name).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const ddmmyyyy = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s) ?? /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (!m) return { d: '', m: '', y: '' }; return s.includes('-') ? { d: m[3]!, m: m[2]!, y: m[1]! } : { d: m[1]!, m: m[2]!, y: m[3]! }; };

export function parseGtgt(xml: string): Gtgt {
  const doc = new DOMParser().parseFromString(xml.replace(/^﻿/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) throw new XmlError('File này không phải XML hợp lệ. Hãy chọn đúng file tờ khai xuất từ phần mềm HTKK.');
  const root = doc.documentElement;
  if (root.localName !== 'HSoThueDTu' || root.namespaceURI !== NS) throw new XmlError('File này không phải tờ khai thuế của HTKK (thiếu thẻ HSoThueDTu).');
  const form = text(doc, 'tenTKhai'), desc = text(doc, 'moTaBMau');
  if (!/01\/GTGT/i.test(form)) throw new XmlError(`Hiện chỉ hỗ trợ Tờ khai 01/GTGT. File này là: ${form || 'mẫu khác'}.`);
  if (!/26\/2015/.test(desc)) throw new XmlError(`Hiện chỉ hỗ trợ tờ khai 01/GTGT theo Thông tư 26/2015/TT-BTC. File này thuộc: ${desc || 'mẫu khác'}.`);

  const kind = text(doc, 'kieuKy'), kyKhai = text(doc, 'kyKKhai');
  const [kyNo, kyYear] = kyKhai.split('/').map((x) => x.trim());
  const no = String(parseInt(kyNo ?? '', 10) || '');
  const period = kind === 'Q' ? `Quý ${no} năm ${kyYear}` : kind === 'M' ? `Tháng ${no} năm ${kyYear}` : kyKhai;
  const periodSlug = (kind === 'Q' ? `Q${no}` : kind === 'M' ? `T${no}` : 'ky') + '-' + (kyYear ?? '');
  const ct: Record<string, number> = {};
  for (const k of ['21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '32a', '33', '34', '35', '36', '37', '38', '39', '40a', '40b', '40', '41', '42', '43']) ct[k] = num(doc, 'ct' + k);
  const sign = ddmmyyyy(text(doc, 'ngayKy'));

  return {
    period, periodSlug, first: text(doc, 'loaiTKhai') !== 'B', times: text(doc, 'loaiTKhai') === 'B' ? text(doc, 'soLan') : '',
    name: text(doc, 'tenNNT'), mst: text(doc, 'mst'), address: text(doc, 'dchiNNT'),
    district: text(doc, 'tenHuyenNNT'), province: text(doc, 'tenTinhNNT'), phone: text(doc, 'dthoaiNNT'), fax: text(doc, 'faxNNT'), email: text(doc, 'emailNNT'),
    agent: {
      name: text(doc, 'tenDLyThue'), mst: text(doc, 'mstDLyThue'), address: text(doc, 'dchiDLyThue'), district: text(doc, 'tenHuyenDLyThue'), province: text(doc, 'tenTinhDLyThue'),
      phone: text(doc, 'dthoaiDLyThue'), fax: text(doc, 'faxDLyThue'), email: text(doc, 'emailDLyThue'), contractNo: text(doc, 'soHDDLyThue'), contractDate: text(doc, 'ngayKyHDDLyThue'),
    },
    staffName: text(doc, 'tenNVDLyThue'), staffCert: text(doc, 'ccchiHNghe'), signDate: sign,
    ct, noActivity: ct['21'] === 1,
  };
}

const money = (n: number) => n.toLocaleString('de-DE'); // dấu chấm ngăn hàng nghìn, như bản in HTKK
// pdfmake chỉ coi là địa chỉ web khi có đủ http(s)://
const fonts = () => ({
  Tinos: { normal: location.origin + '/fonts/Tinos-Regular.ttf', bold: location.origin + '/fonts/Tinos-Bold.ttf', italics: location.origin + '/fonts/Tinos-Italic.ttf', bolditalics: location.origin + '/fonts/Tinos-BoldItalic.ttf' },
});

type Cell = Record<string, unknown>;
const GRAY = '#d9d9d9';

function buildDoc(t: Gtgt): Record<string, unknown> {
  const fs = 10.5;
  const code = (c: string, v: number | null, opts: { bold?: boolean } = {}): Cell => ({
    columns: [{ text: `[${c}]`, width: 30, fontSize: 9.5 }, { text: v === null ? '' : money(v), alignment: 'right', bold: opts.bold }],
    margin: [2, 2, 3, 2],
  });
  const gray = (): Cell => ({ text: '', fillColor: GRAY });
  const lab = (s: string, bold = false, indent = 0): Cell => ({ text: s, bold, margin: [2 + indent, 2, 2, 2] });
  const stt = (s: string, bold = false): Cell => ({ text: s, bold, alignment: 'center', margin: [0, 2, 0, 2] });

  // Một dòng: [STT, chỉ tiêu, ô giá trị, ô thuế]; undefined = ô tô xám (không áp dụng)
  const row = (s: string, label: string, a: [string, number] | undefined, b: [string, number] | undefined, o: { bold?: boolean; indent?: number } = {}): Cell[] => [
    stt(s, o.bold), lab(label, o.bold, o.indent ?? 0), a ? code(a[0], a[1]) : gray(), b ? code(b[0], b[1]) : gray(),
  ];
  const head = (s: string, label: string): Cell[] => [stt(s, true), { ...lab(label, true), colSpan: 3 }, {}, {}];
  const v = (k: string): [string, number] => [k, t.ct[k] ?? 0];

  const body: Cell[][] = [
    [{ text: 'STT', bold: true, alignment: 'center', margin: [0, 3] }, { text: 'Chỉ tiêu', bold: true, alignment: 'center', margin: [0, 3] },
      { text: 'Giá trị HHDV\n(chưa có thuế GTGT)', bold: true, alignment: 'center' }, { text: 'Thuế GTGT', bold: true, alignment: 'center', margin: [0, 8, 0, 0] }],
    [stt('A', true), { ...lab('Không phát sinh hoạt động mua, bán trong kỳ (đánh dấu "X")'), colSpan: 2 }, {},
      { columns: [{ text: '[21]', width: 30, fontSize: 9.5 }, { text: t.noActivity ? 'X' : '', alignment: 'center', bold: true }], margin: [2, 2, 3, 2] }],
    [stt('B', true), lab('Thuế giá trị gia tăng còn được khấu trừ kỳ trước chuyển sang', true), gray(), code('22', t.ct['22'] ?? 0)],
    head('C', 'Kê khai thuế giá trị gia tăng phải nộp Ngân sách nhà nước'),
    head('I', 'Hàng hóa, dịch vụ (HHDV) mua vào trong kỳ'),
    row('1', 'Giá trị và thuế GTGT của hàng hóa, dịch vụ mua vào', v('23'), v('24')),
    row('2', 'Tổng số thuế GTGT được khấu trừ kỳ này', undefined, v('25')),
    head('II', 'Hàng hóa, dịch vụ bán ra trong kỳ'),
    row('1', 'Hàng hóa, dịch vụ bán ra không chịu thuế GTGT', v('26'), undefined),
    row('2', 'Hàng hóa, dịch vụ bán ra chịu thuế GTGT ([27]=[29]+[30]+[32]+[32a]; [28]=[31]+[33])', v('27'), v('28')),
    row('a', 'Hàng hóa, dịch vụ bán ra chịu thuế suất 0%', v('29'), undefined, { indent: 8 }),
    row('b', 'Hàng hóa, dịch vụ bán ra chịu thuế suất 5%', v('30'), v('31'), { indent: 8 }),
    row('c', 'Hàng hóa, dịch vụ bán ra chịu thuế suất 10%', v('32'), v('33'), { indent: 8 }),
    row('d', 'Hàng hóa, dịch vụ bán ra không tính thuế', v('32a'), undefined, { indent: 8 }),
    row('3', 'Tổng doanh thu và thuế GTGT của HHDV bán ra ([34]=[26]+[27]; [35]=[28])', v('34'), v('35')),
    [stt('III', true), lab('Thuế GTGT phát sinh trong kỳ ([36]=[35]-[25])', true), gray(), code('36', t.ct['36'] ?? 0)],
    head('IV', 'Điều chỉnh tăng, giảm thuế GTGT còn được khấu trừ của các kỳ trước'),
    row('1', 'Điều chỉnh giảm', undefined, v('37')),
    row('2', 'Điều chỉnh tăng', undefined, v('38')),
    [stt('V', true), lab('Thuế GTGT đã nộp ở địa phương khác của hoạt động kinh doanh xây dựng, lắp đặt, bán hàng, bất động sản ngoại tỉnh', true), gray(), code('39', t.ct['39'] ?? 0)],
    head('VI', 'Xác định nghĩa vụ thuế GTGT phải nộp trong kỳ:'),
    row('1', 'Thuế GTGT phải nộp của hoạt động sản xuất kinh doanh trong kỳ ([40a]=[36]-[22]+[37]-[38]-[39]≥0)', undefined, v('40a')),
    row('2', 'Thuế GTGT mua vào của dự án đầu tư được bù trừ với thuế GTGT còn phải nộp của hoạt động sản xuất kinh doanh cùng kỳ tính thuế', undefined, v('40b')),
    row('3', 'Thuế GTGT còn phải nộp trong kỳ ([40]=[40a]-[40b])', undefined, v('40')),
    row('4', 'Thuế GTGT chưa được khấu trừ hết kỳ này (nếu ([41]=[36]-[22]+[37]-[38]-[39]<0)', undefined, v('41')),
    row('4.1', 'Tổng số thuế GTGT đề nghị hoàn', undefined, v('42'), { indent: 8 }),
    row('4.2', 'Thuế GTGT còn được khấu trừ chuyển kỳ sau ([43]=[41]-[42])', undefined, v('43'), { indent: 8 }),
  ];

  // Mã số thuế: từng chữ số một ô, như bản in HTKK
  const boxes = (mst: string): Cell => {
    const d = mst.replace(/\D/g, '');
    const cells: Cell[] = []; const widths: number[] = [];
    for (let i = 0; i < 13; i++) {
      if (i === 10) { cells.push({ text: '-', alignment: 'center', border: [false, false, false, false] }); widths.push(8); }
      const ch = d[i] ?? '';
      cells.push({ text: ch, alignment: 'center', fontSize: 10, margin: [0, 0, 0, 0] }); widths.push(13);
    }
    return { table: { widths, heights: 14, body: [cells] }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5 }, margin: [0, 0, 0, 0] };
  };
  const field = (code: string, label: string, value: string): Cell => ({ text: [{ text: `[${code}] ${label}: ` }, { text: value }], margin: [0, 1.5, 0, 1.5] });
  const mstRow = (code: string, mst: string): Cell => ({ columns: [{ text: `[${code}] Mã số thuế:`, width: 'auto', margin: [0, 3, 8, 0] }, boxes(mst)], margin: [0, 2, 0, 2] });
  const two = (a: Cell, b: Cell): Cell => ({ columns: [{ ...a, width: '*' }, { ...b, width: '*' }], columnGap: 10 });
  const ag = t.agent;
  const dots = (s: string) => s || '';
  const fmtDay = t.signDate.d ? `ngày ${t.signDate.d} tháng ${t.signDate.m} năm ${t.signDate.y}` : 'ngày ..... tháng ..... năm .....';

  return {
    pageSize: 'A4', pageMargins: [42, 36, 42, 36],
    defaultStyle: { font: 'Tinos', fontSize: fs, lineHeight: 1.1 },
    info: { title: `Tờ khai 01/GTGT ${t.period} - ${t.mst}`, creator: '', producer: '' },
    content: [
      { text: 'Mẫu số: 01/GTGT', bold: true, alignment: 'right' },
      { text: '(Ban hành kèm theo Thông tư số 26/2015/TT-BTC ngày 27/02/2015 của Bộ Tài chính)', italics: true, alignment: 'right', fontSize: 9, margin: [0, 0, 0, 4] },
      { text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, alignment: 'center', fontSize: 11.5 },
      { text: 'Độc lập - Tự do - Hạnh phúc', bold: true, alignment: 'center', fontSize: 11.5 },
      { canvas: [{ type: 'line', x1: 190, y1: 3, x2: 325, y2: 3, lineWidth: 0.8 }], margin: [0, 0, 0, 6] },
      { text: 'TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG', bold: true, alignment: 'center', fontSize: 14 },
      { text: '(Dành cho người nộp thuế khai thuế giá trị gia tăng theo phương pháp khấu trừ)', italics: true, alignment: 'center', margin: [0, 0, 0, 4] },
      { text: [{ text: '[01] Kỳ tính thuế: ' }, { text: t.period, bold: true }], alignment: 'center', margin: [0, 0, 0, 3] },
      { columns: [{ text: `[02] Lần đầu: [${t.first ? 'X' : ' '}]`, width: '*', alignment: 'right', margin: [0, 0, 30, 0] }, { text: `[03] Bổ sung lần thứ: ${t.first ? '' : t.times}`, width: '*', margin: [30, 0, 0, 0] }], margin: [0, 0, 0, 6] },
      field('04', 'Tên người nộp thuế', t.name),
      mstRow('05', t.mst),
      field('06', 'Địa chỉ', t.address),
      two(field('07', 'Quận/huyện', t.district), field('08', 'Tỉnh/thành phố', t.province)),
      two(field('09', 'Điện thoại', t.phone), two(field('10', 'Fax', t.fax), field('11', 'E-mail', t.email))),
      field('12', 'Tên đại lý thuế (nếu có)', dots(ag.name)),
      mstRow('13', ag.mst),
      field('14', 'Địa chỉ', ag.address),
      two(field('15', 'Quận/huyện', ag.district), field('16', 'Tỉnh/thành phố', ag.province)),
      two(field('17', 'Điện thoại', ag.phone), two(field('18', 'Fax', ag.fax), field('19', 'E-mail', ag.email))),
      field('20', 'Hợp đồng đại lý thuế: Số', `${ag.contractNo}${ag.contractDate ? '   Ngày: ' + ag.contractDate : '   Ngày:'}`),
      { text: 'Đơn vị tiền: đồng Việt Nam', italics: true, alignment: 'right', margin: [0, 4, 0, 2] },
      { table: { widths: [26, '*', 118, 118], headerRows: 1, dontBreakRows: true, body }, layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6 } },
      { text: 'Tôi cam đoan số liệu khai trên là đúng và chịu trách nhiệm trước pháp luật về những số liệu đã khai./.', margin: [0, 10, 0, 8] },
      {
        columns: [
          { width: '*', stack: [{ text: 'NHÂN VIÊN ĐẠI LÝ THUẾ', bold: true }, { text: `Họ và tên: ${t.staffName}` }, { text: `Chứng chỉ hành nghề số: ${t.staffCert}` }] },
          { width: '*', alignment: 'center', stack: [{ text: `......., ${fmtDay}`, italics: true }, { text: 'NGƯỜI NỘP THUẾ hoặc', bold: true }, { text: 'ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ', bold: true }, { text: 'Ký, ghi rõ họ tên; chức vụ và đóng dấu (nếu có)', italics: true, fontSize: 9.5 }] },
        ],
        unbreakable: true,
      },
    ],
  };
}

export async function makeGtgtPdf(t: Gtgt): Promise<Blob> {
  const mod = await import('pdfmake/build/pdfmake');
  const pdfMake = ((mod as unknown as { default?: unknown }).default ?? mod) as {
    addFonts: (f: unknown) => void; setUrlAccessPolicy: (cb: (u: string) => boolean) => void; createPdf: (d: unknown) => { getBlob: () => Promise<Blob> };
  };
  pdfMake.setUrlAccessPolicy((u) => new URL(u, location.href).origin === location.origin); // chỉ cho tải font của chính website
  pdfMake.addFonts(fonts());
  return pdfMake.createPdf(buildDoc(t)).getBlob();
}

export const pdfFileName = (t: Gtgt) => `ToKhai_01GTGT_${t.periodSlug}_${t.mst || 'MST'}.pdf`;
