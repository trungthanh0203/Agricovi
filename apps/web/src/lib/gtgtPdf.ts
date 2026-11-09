// Chuyển file XML tờ khai 01/GTGT (HTKK, Thông tư 26/2015/TT-BTC) sang PDF ngay trên trình duyệt.
// Không gửi gì lên máy chủ và không ghi CSDL. Thư viện PDF và font chỉ được tải khi người dùng bấm "Chuyển đổi".
// Bố cục theo bản in của HTKK (mẫu docs/0315595632000-01_GTGT-Q42021-L00.pdf): khổ Letter, chữ 9,7pt, khung "Mẫu số" bên phải, bảng viền xám nhạt.

export const MAX_XML_BYTES = 5 * 1024 * 1024;
const NS = 'http://kekhaithue.gdt.gov.vn/TKhaiThue';

export interface Gtgt {
  period: string; periodSlug: string; first: boolean; times: string; industry: string; formDesc: string; accountItem: string;
  name: string; mst: string; address: string; district: string; province: string; phone: string; fax: string; email: string;
  agent: { name: string; mst: string; address: string; district: string; province: string; phone: string; fax: string; email: string; contractNo: string; contractDate: string };
  extended: boolean; extendReason: string;
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
  const sign = ddmmyyyy(text(doc, 'ngayKy') || text(doc, 'ngayLapTKhai'));

  return {
    period, periodSlug, first: text(doc, 'loaiTKhai') !== 'B', times: text(doc, 'loaiTKhai') === 'B' ? text(doc, 'soLan') : '',
    industry: text(doc, 'ten_NganhNghe'), formDesc: desc, accountItem: text(doc, 'tieuMucHachToan'),
    name: text(doc, 'tenNNT'), mst: text(doc, 'mst'), address: text(doc, 'dchiNNT'),
    district: text(doc, 'tenHuyenNNT'), province: text(doc, 'tenTinhNNT'), phone: text(doc, 'dthoaiNNT'), fax: text(doc, 'faxNNT'), email: text(doc, 'emailNNT'),
    agent: {
      name: text(doc, 'tenDLyThue'), mst: text(doc, 'mstDLyThue'), address: text(doc, 'dchiDLyThue'), district: text(doc, 'tenHuyenDLyThue'), province: text(doc, 'tenTinhDLyThue'),
      phone: text(doc, 'dthoaiDLyThue'), fax: text(doc, 'faxDLyThue'), email: text(doc, 'emailDLyThue'), contractNo: text(doc, 'soHDDLyThue'), contractDate: text(doc, 'ngayKyHDDLyThue'),
    },
    extended: !!text(doc, 'maLyDoGiaHan'), extendReason: text(doc, 'lyDoGiaHan'),
    staffName: text(doc, 'tenNVDLyThue'), staffCert: text(doc, 'ccchiHNghe'), signDate: sign,
    ct, noActivity: ct['21'] === 1,
  };
}

const money = (n: number) => n.toLocaleString('de-DE'); // dấu chấm ngăn hàng nghìn
// pdfmake chỉ coi là địa chỉ web khi có đủ http(s)://
const fonts = () => ({
  Tinos: { normal: location.origin + '/fonts/Tinos-Regular.ttf', bold: location.origin + '/fonts/Tinos-Bold.ttf', italics: location.origin + '/fonts/Tinos-Italic.ttf', bolditalics: location.origin + '/fonts/Tinos-BoldItalic.ttf' },
});

type Cell = Record<string, unknown>;
const FS = 9.7;               // cỡ chữ của bản in HTKK
const LINE = 11.2;            // chiều cao một dòng chữ
const PAD = 3.45;             // đệm trên/dưới ô để dòng đơn cao khoảng 18,4pt như mẫu
const OUTER = '#808080', INNER = '#cccccc';
// Cột bảng (tổng 549pt = từ lề trái 38 tới 587): STT | Chỉ tiêu | [mã] | Giá trị | [mã] | Thuế
const COLS = [24.8, 303, 31, 72, 31, 72];

function buildDoc(t: Gtgt): Record<string, unknown> {
  const bold = (s: string) => ({ text: s, bold: true });
  // Ước lượng số dòng của ô Chỉ tiêu để canh giữa theo chiều dọc mã và số
  const linesOf = (label: string, b: boolean, span: number) => Math.max(1, Math.ceil((label.length * (b ? 4.7 : 4.4)) / (COLS.slice(1, 1 + span).reduce((a, c) => a + c, 0) - 6)));
  const vpad = (n: number) => PAD + ((n - 1) * LINE) / 2;

  const sttCell = (s: string, n: number): Cell => ({ text: s, bold: true, alignment: 'center', margin: [0, vpad(n), 0, vpad(n)] });
  const code = (c: string, n: number): Cell => ({ text: `[${c}]`, bold: true, alignment: 'center', margin: [0, vpad(n), 0, vpad(n)] });
  const val = (v: number, n: number): Cell => ({ text: money(v), noWrap: true, alignment: 'right', margin: [0, vpad(n), 3, vpad(n)] });
  const empty = (): Cell => ({ text: '' });

  // Một dòng của bảng: nhãn + (ô giá trị) + (ô thuế). Ô trống được gộp với ô bên cạnh như bản in HTKK.
  const row = (s: string, label: string, a: string | null, b: string | null, o: { b?: boolean; indent?: number } = {}): Cell[] => {
    const span = a ? 1 : 3;
    const n = linesOf(label, !!o.b, span);
    const lab: Cell = { text: label, bold: !!o.b, margin: [3 + (o.indent ?? 0), PAD, 2, PAD], ...(span > 1 ? { colSpan: span } : {}) };
    const cells: Cell[] = [sttCell(s, n), lab];
    for (let i = 1; i < span; i++) cells.push(empty());
    if (a) { cells.push(code(a, n), val(t.ct[a] ?? 0, n)); }
    if (b) { cells.push(code(b, n), val(t.ct[b] ?? 0, n)); }
    else { cells.push({ text: '', colSpan: 2 }, empty()); }
    return cells;
  };
  const head = (s: string, label: string): Cell[] => [sttCell(s, 1), { text: label, bold: true, margin: [3, PAD, 2, PAD], colSpan: 5 }, empty(), empty(), empty(), empty()];

  const hd = (s: string, extra: Cell = {}): Cell => ({ text: s, bold: true, alignment: 'center', margin: [0, PAD + 2, 0, PAD + 2], ...extra });
  const body: Cell[][] = [
    [hd('STT'), hd('Chỉ tiêu'), hd('Giá trị HHDV\n(chưa có thuế GTGT)', { colSpan: 2 }), empty(), hd('Thuế\nGTGT', { colSpan: 2 }), empty()],
    // Dòng A: ô đánh dấu [21]
    [sttCell('A', 1), { text: 'Không phát sinh hoạt động mua, bán trong kỳ (đánh dấu "X")', bold: true, margin: [3, PAD, 2, PAD] }, code('21', 1),
      { text: t.noActivity ? '[X]' : '[]', alignment: 'center', margin: [0, PAD, 0, PAD] }, { text: '', colSpan: 2 }, empty()],
    row('B', 'Thuế GTGT còn được khấu trừ kỳ trước chuyển sang', null, '22', { b: true }),
    head('C', 'Kê khai thuế GTGT phải nộp Ngân sách nhà nước'),
    head('I', 'Hàng hoá, dịch vụ (HHDV) mua vào trong kỳ'),
    row('1', 'Giá trị và thuế GTGT của hàng hoá, dịch vụ mua vào', '23', '24'),
    row('2', 'Tổng số thuế GTGT được khấu trừ kỳ này', null, '25'),
    head('II', 'Hàng hoá, dịch vụ bán ra trong kỳ'),
    row('1', 'Hàng hóa, dịch vụ bán ra không chịu thuế GTGT', '26', null),
    row('2', 'Hàng hóa, dịch vụ bán ra chịu thuế GTGT ([27]=[29]+[30]+[32]+[32a]; [28]=[31]+[33])', '27', '28'),
    row('a', 'Hàng hoá, dịch vụ bán ra chịu thuế suất 0%', '29', null),
    row('b', 'Hàng hoá, dịch vụ bán ra chịu thuế suất 5%', '30', '31'),
    row('c', 'Hàng hoá, dịch vụ bán ra chịu thuế suất 10%', '32', '33'),
    row('d', 'Hàng hoá, dịch vụ bán ra không tính thuế', '32a', null),
    row('3', 'Tổng doanh thu và thuế GTGT của HHDV bán ra ([34]=[26]+[27]; [35]=[28])', '34', '35'),
    row('III', 'Thuế GTGT phát sinh trong kỳ ([36]=[35]-[25])', null, '36'),
    head('IV', 'Điều chỉnh tăng, giảm thuế GTGT còn được khấu trừ của các kỳ trước'),
    row('1', 'Điều chỉnh giảm', null, '37'),
    row('2', 'Điều chỉnh tăng', null, '38'),
    row('V', 'Thuế GTGT đã nộp ở địa phương khác của hoạt động kinh doanh xây dựng, lắp đặt, bán hàng, bất động sản ngoại tỉnh', null, '39', { b: true }),
    head('VI', 'Xác định nghĩa vụ thuế GTGT phải nộp trong kỳ:'),
    row('1', 'Thuế GTGT phải nộp của hoạt động sản xuất kinh doanh trong kỳ ([40a]=[36]-[22]+[37]-[38] - [39]≥ 0)', null, '40a', { b: true }),
    row('2', 'Thuế GTGT mua vào của dự án đầu tư được bù trừ với thuế GTGT còn phải nộp của hoạt động sản xuất kinh doanh cùng kỳ tính thuế', null, '40b', { b: true }),
    row('3', 'Thuế GTGT còn phải nộp trong kỳ ([40]=[40a]-[40b])', null, '40', { b: true }),
    row('4', 'Thuế GTGT chưa khấu trừ hết kỳ này (nếu [41]=[36]-[22]+[37]-[38]-[39] < 0)', null, '41', { b: true }),
    row('4.1', 'Tổng số thuế GTGT đề nghị hoàn', null, '42', { b: true }),
    row('4.2', 'Thuế GTGT còn được khấu trừ chuyển kỳ sau ([43]=[41]-[42])', null, '43', { b: true }),
  ];
  // Các dòng tiêu đề nhóm (C, I, II, IV, VI) in đậm; riêng III và các dòng con 1, 2 của I, II, IV in thường như mẫu (đã đặt ở trên)

  // ---- Phần đầu: các trường thông tin
  const f = (c: string, label: string, value: string, strong = false): Cell => ({ text: [{ text: `[${c}] `, bold: true }, { text: label, bold: strong }, { text: value ? ' ' + value : '' }] });
  const one = (c: string, label: string, value: string, strong = false): Cell => ({ ...f(c, label, value, strong), margin: [0, 0, 0, 1.8] });
  const cols = (cells: Cell[], widths: (number | string)[]): Cell => ({ columns: cells, columnGap: 0, width: '*', ...{ widths }, margin: [0, 0, 0, 1.8] });
  const three = (a: Cell, b: Cell, c: Cell): Cell => ({ columns: [{ ...a, width: 144 }, { ...b, width: 88 }, { ...c, width: '*' }], margin: [0, 0, 0, 1.8] });
  const two = (a: Cell, b: Cell): Cell => ({ columns: [{ ...a, width: 144 }, { ...b, width: '*' }], margin: [0, 0, 0, 1.8] });
  void cols;
  const ag = t.agent;
  const ctr = (s: string, o: Cell = {}): Cell => ({ text: s, alignment: 'center', ...o });
  const desc = t.formDesc.replace(/^\(\s*/, '( ').replace(/\s*\)$/, ' )');

  return {
    pageSize: 'LETTER', pageMargins: [37, 8, 37, 24],
    defaultStyle: { font: 'Tinos', fontSize: FS, lineHeight: 1 },
    info: { title: `Tờ khai 01/GTGT ${t.period} - ${t.mst}`, creator: '', producer: '' },
    footer: (current: number, total: number) => ({ text: `${current}/${total}`, alignment: 'center', fontSize: 11.6, margin: [0, 9, 0, 0] }),
    content: [
      {
        columns: [
          {
            width: '*', stack: [
              ctr('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, margin: [0, 0, 0, 1] }),
              ctr('Độc lập-Tự do-Hạnh phúc', { bold: true }),
              ctr('-------------------------', { margin: [0, 0, 0, 2] }),
              ctr('TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG (MẪU SỐ 01/GTGT)', { bold: true, margin: [0, 0, 0, 1] }),
              ctr('(Dành cho người nộp thuế khai thuế giá trị gia tăng theo phương pháp khấu trừ)', { italics: true, margin: [0, 0, 0, 1] }),
              ctr(`Ngành nghề: ${t.industry}`, { margin: [0, 0, 0, 1] }),
              { ...ctr('', { margin: [0, 0, 0, 1] }), text: [{ text: '[01]', bold: true }, { text: ` Kỳ tính thuế: ${t.period}` }] },
              { ...ctr('', { margin: [0, 0, 0, 0] }), text: [{ text: '[02]', bold: true }, { text: ` Lần đầu: [${t.first ? 'X' : ' '}] ` }, { text: '[03]', bold: true }, { text: ` Bổ sung lần thứ: [${t.first ? ' ' : t.times}]` }] },
            ],
          },
          {
            width: 96, margin: [0, 0, 0, 0],
            table: { widths: ['*'], body: [[{ stack: [{ text: [{ text: 'Mẫu số: ' }, { text: '01/GTGT', bold: true }], alignment: 'center' }, { text: desc, italics: true, fontSize: 7.2, alignment: 'center', lineHeight: 1.1 }], margin: [2, 1, 2, 2] }]] },
            layout: { hLineColor: () => '#e0e0e0', vLineColor: () => '#e0e0e0', hLineWidth: () => 0.6, vLineWidth: () => 0.6, paddingLeft: () => 1, paddingRight: () => 1, paddingTop: () => 0, paddingBottom: () => 0 },
          },
        ],
        margin: [0, 0, 0, 17],
      },
      one('04', 'Tên người nộp thuế:', t.name, true),
      one('05', 'Mã số thuế:', t.mst, true),
      one('06', 'Địa chỉ:', t.address),
      two(f('07', 'Quận/Huyện:', t.district), f('08', 'Tỉnh/Thành phố:', t.province)),
      three(f('09', 'Điện thoại:', t.phone), f('10', 'Fax:', t.fax), f('11', 'E-mail:', t.email)),
      { text: '', margin: [0, 0, 0, 1.8] },
      one('12', 'Tên đại lý thuế (nếu có):', ag.name, true),
      one('13', 'Mã số thuế:', ag.mst, true),
      one('14', 'Địa chỉ:', ag.address),
      two(f('15', 'Quận/Huyện:', ag.district), f('16', 'Tỉnh/Thành phố:', ag.province)),
      three(f('17', 'Điện thoại:', ag.phone), f('18', 'Fax:', ag.fax), f('19', 'E-mail:', ag.email)),
      { columns: [{ width: 144, text: [{ text: '[20] ', bold: true }, { text: `Hợp đồng đại lý thuế: Số${ag.contractNo ? ' ' + ag.contractNo : ''}` }] }, { width: '*', text: `Ngày:${ag.contractDate ? ' ' + ag.contractDate : ''}` }], margin: [0, 0, 0, 1.8] },
      { text: `Gia hạn [${t.extended ? 'X' : ''}]`, margin: [1, 2, 0, 4] },
      { text: `Lý do gia hạn:${t.extendReason ? ' ' + t.extendReason : ''}`, margin: [1, 0, 0, 4] },
      { text: 'Đơn vị tiền: đồng Việt Nam', italics: true, alignment: 'right', margin: [0, 0, 0, 2] },
      {
        table: { widths: COLS, dontBreakRows: true, body },
        layout: {
          hLineWidth: () => 0.6, vLineWidth: () => 0.6,
          hLineColor: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? OUTER : INNER),
          vLineColor: (i: number, node: { table: { widths: unknown[] } }) => (i === 0 || i === node.table.widths.length ? OUTER : INNER),
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
      { text: 'Tôi cam đoan số liệu khai trên là đúng và chịu trách nhiệm trước pháp luật về những số liệu đã khai./...', margin: [0, 6, 0, 16] },
      {
        columns: [
          { width: 343, margin: [3, 0, 0, 0], stack: [bold('NHÂN VIÊN ĐẠI LÝ THUẾ'), { text: `Họ và tên:${t.staffName ? ' ' + t.staffName : ''}`, margin: [0, 12, 0, 12] }, { text: `Chứng chỉ hành nghề số:${t.staffCert ? ' ' + t.staffCert : ''}` }] },
          {
            width: 190, alignment: 'center', stack: [
              { text: t.signDate.d ? `Ngày ${t.signDate.d} tháng ${t.signDate.m} năm ${t.signDate.y}` : 'Ngày ..... tháng ..... năm .....', italics: true, margin: [0, 0, 0, 8] },
              bold('NGƯỜI NỘP THUẾ hoặc'), bold('ĐẠI DIỆN HỢP PHÁP CỦA NGƯỜI NỘP THUẾ'),
              { text: 'Ký, ghi rõ họ tên, chức vụ và đóng dấu (nếu có)', italics: true, margin: [0, 1, 0, 0] },
            ],
          },
        ],
        unbreakable: true,
      },
      { text: 'Ghi chú:', bold: true, italics: true, decoration: 'underline', margin: [0, 26, 0, 12] },
      { text: '- GTGT: Giá trị Gia tăng', italics: true, margin: [0, 0, 0, 1] },
      { text: '- HHDV: Hàng hoá dịch vụ', italics: true, margin: [0, 0, 0, 13] },
      ...(t.accountItem ? [
        { text: 'Hỗ trợ hạch toán MLNSNN', bold: true, italics: true, decoration: 'underline' },
        { text: `Hạch toán chỉ tiêu [40] vào tiểu mục ${t.accountItem}` },
        { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 538, y2: 6, lineWidth: 0.6, lineColor: '#bbbbbb' }] },
      ] : []),
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
