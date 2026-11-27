
import { useEffect, useMemo, useState } from 'react';
import { db, ready } from './supabase';

const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
};

const fmt = d => {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};

const money = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';

const belts = [
  'Trắng', 'Vàng', 'Cam', 'Xanh lá', 'Xanh dương',
  'Tím', 'Nâu 0', 'Nâu 1', 'Nâu 2', 'Nâu 3', 'Đen', 'Khác'
];

const empty = {
  full_name: '',
  birth_date: '',
  phone: '',
  class_name: '',
  belt: 'Trắng',
  join_date: '',
  status: 'Đang tập',
  notes: ''
};

const loginEmail = u => `${u.trim().toLowerCase()}@karate.invalid`;

const makeStudentCode = () => {
  const id = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 10)
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  return 'HS' + id.toUpperCase();
};

const monthAfter = (month, offset) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0')
  ].join('-');
};

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  const [marks, setMarks] = useState({});
  const [history, setHistory] = useState({});
  const [date, setDate] = useState(today());

  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [status, setStatus] = useState('');

  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(empty);
  const [savingStudent, setSavingStudent] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState(null);

  const [tab, setTab] = useState('list');

  const [feeMonth, setFeeMonth] = useState(today().slice(0, 7));
  const [feeRows, setFeeRows] = useState([]);
  const [feesLoading, setFeesLoading] = useState(false);
  const [creatingInvoices, setCreatingInvoices] = useState(false);

  const [payAmounts, setPayAmounts] = useState({});
  const [payMethods, setPayMethods] = useState({});
  const [paying, setPaying] = useState(null);

  const [feeRate, setFeeRate] = useState(300000);
  const [feeRateInput, setFeeRateInput] = useState('300000');
  const [savingFee, setSavingFee] = useState(false);

  // Đăng nhập và theo dõi phiên
  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }

    let mounted = true;

    db.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setErr(error.message);
      setSession(data?.session || null);
      setLoading(false);
    });

    const { data: { subscription } } = db.auth.onAuthStateChange((_, s) => {
      setSession(s);
      setProfile(null);
      setRows([]);
      setFeeRows([]);
      setMarks({});
      setHistory({});
      setErr('');
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Tải hồ sơ tài khoản
  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      const { data, error } = await db
        .from('profiles')
        .select('id,full_name,role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setErr('Lỗi tải hồ sơ tài khoản: ' + error.message);
        setProfile(null);
        return;
      }

      setProfile(data || null);
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Tải võ sinh và dữ liệu điểm danh
  async function loadRows() {
    setRowsLoading(true);

    try {
      const studentResult = await db
        .from('students')
        .select('*')
        .order('full_name');

      if (studentResult.error) {
        setErr('Lỗi tải danh sách võ sinh: ' + studentResult.error.message);
        return false;
      }

      const students = studentResult.data || [];
      setRows(students);

      const sessionResult = await db
        .from('sessions')
        .select('id')
        .eq('session_date', date);

      if (sessionResult.error) {
        setErr('Lỗi tải buổi tập: ' + sessionResult.error.message);
        return false;
      }

      const sessionIds = (sessionResult.data || []).map(x => x.id);
      let todayAttendance = [];

      if (sessionIds.length) {
        const attendanceResult = await db
          .from('attendance')
          .select('student_id,status')
          .in('session_id', sessionIds);

        if (attendanceResult.error) {
          setErr('Lỗi tải điểm danh: ' + attendanceResult.error.message);
          return false;
        }

        todayAttendance = attendanceResult.data || [];
      }

      const currentMarks = {};
      todayAttendance.forEach(x => {
        currentMarks[x.student_id] = x.status;
      });

      setMarks(currentMarks);

      const historyResult = await db
        .from('attendance')
        .select('student_id,status');

      if (historyResult.error) {
        setErr('Lỗi tải lịch sử điểm danh: ' + historyResult.error.message);
        return false;
      }

      const hist = {};

      (historyResult.data || []).forEach(x => {
        hist[x.student_id] ??= {
          present: 0,
          absent: 0,
          excused: 0
        };

        if (x.status === 'Có mặt') hist[x.student_id].present++;
        else if (x.status === 'Vắng') hist[x.student_id].absent++;
        else if (x.status === 'Có phép') hist[x.student_id].excused++;
      });

      setHistory(hist);
      return true;
    } catch (error) {
      setErr('Lỗi tải dữ liệu: ' + (error?.message || error));
      return false;
    } finally {
      setRowsLoading(false);
    }
  }

  useEffect(() => {
    if (profile?.id) loadRows();
  }, [date, profile?.id]);

  // Tải thiết lập học phí
  async function loadFeeSettings() {
    const r = await db
      .from('tuition_settings')
      .select('monthly_fee')
      .eq('id', 1)
      .maybeSingle();

    if (r.error) {
      setErr('Lỗi tải mức học phí: ' + r.error.message);
      return false;
    }

    const n = Number(r.data?.monthly_fee || 300000);
    setFeeRate(n);
    setFeeRateInput(String(n));
    return true;
  }

  // Tải hóa đơn và thanh toán
  async function loadFees() {
    setFeesLoading(true);

    try {
      const first = feeMonth + '-01';

      const invoiceResult = await db
        .from('tuition_invoices')
        .select('id,student_id,billing_month,amount_due')
        .eq('billing_month', first)
        .order('created_at');

      if (invoiceResult.error) {
        setErr('Lỗi tải hóa đơn: ' + invoiceResult.error.message);
        return false;
      }

      const invoices = invoiceResult.data || [];

      if (!invoices.length) {
        setFeeRows([]);
        return true;
      }

      const ids = invoices.map(x => x.student_id);
      const invoiceIds = invoices.map(x => x.id);

      const [studentResult, paymentResult] = await Promise.all([
        db.from('students')
          .select('id,full_name,class_name')
          .in('id', ids),

        db.from('tuition_payments')
          .select('id,invoice_id,amount,payment_method,paid_at,note')
          .in('invoice_id', invoiceIds)
          .order('paid_at', { ascending: false })
      ]);

      if (studentResult.error) {
        setErr('Lỗi tải tên võ sinh: ' + studentResult.error.message);
        return false;
      }

      if (paymentResult.error) {
        setErr('Lỗi tải thanh toán: ' + paymentResult.error.message);
        return false;
      }

      const studentMap = Object.fromEntries(
        (studentResult.data || []).map(x => [x.id, x])
      );

      const sums = {};

      (paymentResult.data || []).forEach(p => {
        sums[p.invoice_id] = (sums[p.invoice_id] || 0) + Number(p.amount);
      });

      setFeeRows(invoices.map(x => ({
        ...x,
        student: studentMap[x.student_id] || null,
        paid: sums[x.id] || 0,
        payments: (paymentResult.data || []).filter(
          p => p.invoice_id === x.id
        )
      })));

      return true;
    } catch (error) {
      setErr('Lỗi tải học phí: ' + (error?.message || error));
      return false;
    } finally {
      setFeesLoading(false);
    }
  }

  useEffect(() => {
    if (profile && tab === 'fees') {
      setErr('');
      loadFeeSettings();
      loadFees();
    }
  }, [profile?.id, tab, feeMonth]);

  // Lưu mức học phí
  async function saveFeeRate() {
    setErr('');

    const n = Number(feeRateInput);

    if (!Number.isInteger(n) || n < 1) {
      setErr('Mức học phí phải là số nguyên dương.');
      return;
    }

    setSavingFee(true);

    try {
      const check = await db
        .from('tuition_settings')
        .select('id')
        .eq('id', 1)
        .maybeSingle();

      if (check.error) {
        setErr('Lỗi kiểm tra mức học phí: ' + check.error.message);
        return;
      }

      let result;

      if (check.data) {
        result = await db
          .from('tuition_settings')
          .update({
            monthly_fee: n,
            updated_at: new Date().toISOString()
          })
          .eq('id', 1);
      } else {
        result = await db
          .from('tuition_settings')
          .insert({
            id: 1,
            monthly_fee: n,
            updated_at: new Date().toISOString()
          });
      }

      if (result.error) {
        setErr('Không lưu được mức học phí: ' + result.error.message);
        return;
      }

      setFeeRate(n);
      setFeeRateInput(String(n));
      setErr('Đã lưu mức học phí mới. Hóa đơn cũ được giữ nguyên.');
    } catch (error) {
      setErr('Lỗi lưu mức học phí: ' + (error?.message || error));
    } finally {
      setSavingFee(false);
    }
  }

  // Tạo hóa đơn cho võ sinh đang tập
  async function createInvoices() {
    if (creatingInvoices) return;

    setErr('');

    if (rowsLoading) {
      setErr('Danh sách võ sinh đang tải. Vui lòng thử lại.');
      return;
    }

    if (!rows.length) {
      setErr('Chưa có dữ liệu võ sinh.');
      return;
    }

    const active = rows.filter(s => s.status === 'Đang tập');

    if (!active.length) {
      setErr('Không có võ sinh đang tập để tạo học phí.');
      return;
    }

    if (!Number.isInteger(Number(feeRate)) || feeRate < 1) {
      setErr('Mức học phí hiện tại không hợp lệ.');
      return;
    }

    setCreatingInvoices(true);

    try {
      const first = feeMonth + '-01';

      const payload = active.map(s => ({
        student_id: s.id,
        billing_month: first,
        amount_due: feeRate
      }));

      const result = await db
        .from('tuition_invoices')
        .upsert(payload, {
          onConflict: 'student_id,billing_month',
          ignoreDuplicates: true
        });

      if (result.error) {
        setErr('Lỗi tạo học phí: ' + result.error.message);
        return;
      }

      const loaded = await loadFees();
      if (!loaded) return;

      setErr(
        'Đã xử lý hóa đơn cho ' + active.length +
        ' võ sinh. Hóa đơn đã tồn tại không bị thay đổi.'
      );
    } catch (error) {
      setErr('Lỗi tạo học phí: ' + (error?.message || error));
    } finally {
      setCreatingInvoices(false);
    }
  }

  // Ghi nhận thanh toán nhiều tháng
  async function addPayment(invoice) {
    if (paying) return;

    setErr('');

    const amount = Number(payAmounts[invoice.id]);
    const method = payMethods[invoice.id] || 'cash';

    if (!Number.isInteger(amount) || amount <= 0) {
      setErr('Nhập số tiền thanh toán hợp lệ.');
      return;
    }

    if (!['cash', 'transfer'].includes(method)) {
      setErr('Hình thức thanh toán không hợp lệ.');
      return;
    }

    setPaying(invoice.id);

    try {
      const endMonth = monthAfter(feeMonth, 35) + '-01';

      const existingResult = await db
        .from('tuition_invoices')
        .select('id,student_id,billing_month,amount_due')
        .eq('student_id', invoice.student_id)
        .gte('billing_month', feeMonth + '-01')
        .lte('billing_month', endMonth);

      if (existingResult.error) {
        setErr(existingResult.error.message);
        return;
      }

      const existing = existingResult.data || [];
      const byMonth = Object.fromEntries(
        existing.map(x => [x.billing_month, x])
      );

      const paid = {};

      if (existing.length) {
        const paymentResult = await db
          .from('tuition_payments')
          .select('invoice_id,amount')
          .in('invoice_id', existing.map(x => x.id));

        if (paymentResult.error) {
          setErr(paymentResult.error.message);
          return;
        }

        (paymentResult.data || []).forEach(x => {
          paid[x.invoice_id] = (paid[x.invoice_id] || 0) + Number(x.amount);
        });
      }

      let remaining = amount;
      let lastMonth = feeMonth;
      const plan = [];

      for (let i = 0; i < 36 && remaining > 0; i++) {
        const month = monthAfter(feeMonth, i);
        const dateValue = month + '-01';
        const inv = byMonth[dateValue];

        const due = inv ? Number(inv.amount_due) : Number(feeRate);
        const already = inv ? (paid[inv.id] || 0) : 0;
        const left = Math.max(0, due - already);

        if (left > 0) {
          const part = Math.min(left, remaining);

          plan.push({
            month,
            date: dateValue,
            amount: part
          });

          remaining -= part;
          lastMonth = month;
        }
      }

      if (remaining > 0) {
        setErr('Số tiền vượt quá khả năng phân bổ trong 36 tháng. Chưa ghi nhận thanh toán.');
        return;
      }

      const missing = plan
        .filter(x => !byMonth[x.date])
        .map(x => ({
          student_id: invoice.student_id,
          billing_month: x.date,
          amount_due: feeRate
        }));

      if (missing.length) {
        const createResult = await db
          .from('tuition_invoices')
          .upsert(missing, {
            onConflict: 'student_id,billing_month',
            ignoreDuplicates: true
          });

        if (createResult.error) {
          setErr('Lỗi tạo hóa đơn tháng tiếp theo: ' + createResult.error.message);
          return;
        }
      }

      const requiredDates = plan.map(x => x.date);

      const refreshed = await db
        .from('tuition_invoices')
        .select('id,billing_month')
        .eq('student_id', invoice.student_id)
        .in('billing_month', requiredDates);

      if (refreshed.error) {
        setErr(refreshed.error.message);
        return;
      }

      const invoiceMap = Object.fromEntries(
        (refreshed.data || []).map(x => [x.billing_month, x])
      );

      const inserts = [];

      for (const item of plan) {
        const inv = invoiceMap[item.date];

        if (!inv) {
          setErr('Không tìm thấy hóa đơn tháng ' + item.month + '. Chưa ghi nhận thanh toán.');
          return;
        }

        inserts.push({
          invoice_id: inv.id,
          amount: item.amount,
          payment_method: method,
          note: 'Thu gộp từ ' + feeMonth
        });
      }

      const paymentInsert = await db
        .from('tuition_payments')
        .insert(inserts);

      if (paymentInsert.error) {
        setErr('Lỗi ghi nhận thanh toán: ' + paymentInsert.error.message);
        return;
      }

      setPayAmounts(v => ({ ...v, [invoice.id]: '' }));

      const loaded = await loadFees();
      if (!loaded) return;

      setErr(
        'Đã ghi nhận ' + money(amount) +
        ', phân bổ đến tháng ' + lastMonth + '.'
      );
    } catch (error) {
      setErr('Lỗi thanh toán: ' + (error?.message || error));
    } finally {
      setPaying(null);
    }
  }

  // Đăng nhập
  async function login(e) {
    e.preventDefault();
    setErr('');

    const clean = username.trim().toLowerCase();

    const authEmail = clean.includes('@')
      ? clean
      : loginEmail(clean);

    if (
      !clean.includes('@') &&
      !/^[a-z0-9._-]{3,30}$/.test(clean)
    ) {
      setErr('Tên đăng nhập gồm 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
      return;
    }

    const { error } = await db.auth.signInWithPassword({
      email: authEmail,
      password
    });

    if (error) {
      setErr('Không đăng nhập được. Kiểm tra tên đăng nhập và mật khẩu.');
    }
  }

  // Thêm hoặc sửa võ sinh
  async function save(e) {
    e.preventDefault();

    if (savingStudent) return;

    setErr('');
    setSavingStudent(true);

    try {
      const payload = {
        ...form,
        birth_date: form.birth_date || null,
        join_date: form.join_date || null
      };

      let result;

      if (edit) {
        result = await db
          .from('students')
          .update(payload)
          .eq('id', edit);
      } else {
        result = await db
          .from('students')
          .insert({
            ...payload,
            code: makeStudentCode()
          });
      }

      if (result.error) {
        setErr('Không lưu được hồ sơ: ' + result.error.message);
        return;
      }

      setModal(false);
      setEdit(null);
      setForm(empty);

      await loadRows();
      setErr('Đã lưu hồ sơ võ sinh.');
    } catch (error) {
      setErr('Lỗi lưu hồ sơ: ' + (error?.message || error));
    } finally {
      setSavingStudent(false);
    }
  }

  // Điểm danh
  async function mark(studentId, value) {
    const student = rows.find(x => x.id === studentId);
    if (!student) return;

    setErr('');

    try {
      const className = student.class_name || 'Chưa phân lớp';

      const sessionResult = await db
        .from('sessions')
        .select('id')
        .eq('session_date', date)
        .eq('class_name', className)
        .maybeSingle();

      if (sessionResult.error) {
        setErr('Lỗi kiểm tra buổi tập: ' + sessionResult.error.message);
        return;
      }

      let sessionId = sessionResult.data?.id;

      if (!sessionId) {
        const createSession = await db
          .from('sessions')
          .insert({
            session_date: date,
            class_name: className
          })
          .select('id')
          .single();

        if (createSession.error) {
          setErr('Lỗi tạo buổi tập: ' + createSession.error.message);
          return;
        }

        sessionId = createSession.data.id;
      }

      const existing = await db
        .from('attendance')
        .select('id')
        .eq('session_id', sessionId)
        .eq('student_id', studentId)
        .maybeSingle();

      if (existing.error) {
        setErr('Lỗi kiểm tra điểm danh: ' + existing.error.message);
        return;
      }

      let result;

      if (existing.data?.id) {
        result = await db
          .from('attendance')
          .update({ status: value })
          .eq('id', existing.data.id);
      } else {
        result = await db
          .from('attendance')
          .insert({
            session_id: sessionId,
            student_id: studentId,
            status: value
          });
      }

      if (result.error) {
        setErr('Lỗi lưu điểm danh: ' + result.error.message);
        return;
      }

      setMarks(v => ({ ...v, [studentId]: value }));
      await loadRows();
    } catch (error) {
      setErr('Lỗi điểm danh: ' + (error?.message || error));
    }
  }

  // Xóa toàn bộ dữ liệu liên quan đến võ sinh
  async function deleteStudent(student) {
    if (deletingStudent) return;

    const confirmed = confirm(
      `CẢNH BÁO XÓA VĨNH VIỄN!\n\n` +
      `Bạn có chắc chắn muốn xóa võ sinh "${student.full_name}"?\n\n` +
      `Hệ thống sẽ xóa:\n` +
      `- Hồ sơ võ sinh\n` +
      `- Lịch sử điểm danh\n` +
      `- Hóa đơn học phí\n` +
      `- Lịch sử thanh toán\n\n` +
      `Các buổi tập chung của CLB vẫn được giữ lại.\n\n` +
      `Thao tác này không thể hoàn tác!`
    );

    if (!confirmed) return;

    setErr('');
    setDeletingStudent(student.id);

    try {
      const result = await db
        .from('students')
        .delete()
        .eq('id', student.id)
        .select('id');

      if (result.error) {
        setErr('Không xóa được: ' + result.error.message);
        return;
      }

      if (!result.data?.length) {
        setErr('Không tìm thấy hồ sơ hoặc tài khoản không có quyền xóa.');
        return;
      }

      setRows(v => v.filter(x => x.id !== student.id));

      setMarks(v => {
        const next = { ...v };
        delete next[student.id];
        return next;
      });

      setHistory(v => {
        const next = { ...v };
        delete next[student.id];
        return next;
      });

      setFeeRows(v => v.filter(x => x.student_id !== student.id));

      setErr('Đã xóa toàn bộ dữ liệu liên quan đến võ sinh.');

      await loadRows();

      if (tab === 'fees') {
        await loadFees();
      }
    } catch (error) {
      setErr('Lỗi xóa võ sinh: ' + (error?.message || error));
    } finally {
      setDeletingStudent(null);
    }
  }

  const classes = useMemo(
    () => [...new Set(
      rows.map(x => x.class_name).filter(Boolean)
    )].sort(),
    [rows]
  );

  // Lọc và tự động đưa võ sinh đã nghỉ xuống cuối
  const filtered = rows
    .filter(s =>
      (!q || [
        s.full_name,
        s.phone,
        s.class_name
      ].some(v =>
        (v || '').toLocaleLowerCase('vi')
          .includes(q.toLocaleLowerCase('vi'))
      )) &&
      (!cls || s.class_name === cls) &&
      (!status || s.status === status)
    )
    .sort((a, b) => {
      const order = {
        'Đang tập': 0,
        'Bảo lưu': 1,
        'Đã nghỉ': 2
      };

      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });

  const statFor = id => history[id] || {
    present: 0,
    absent: 0,
    excused: 0
  };

  const pct = id => {
    const h = statFor(id);
    const n = h.present + h.absent + h.excused;
    return n ? Math.round(h.present / n * 100) : 0;
  };

  const beltClass = b => b?.startsWith('Nâu') ? 'brown' : '';
  const markedValues = Object.values(marks);

  const exportCSV = (filename, headers, data) => {
    const csv = '\uFEFF' + [
      headers,
      ...data
    ].map(r =>
      r.map(v =>
        '"' + String(v ?? '').replaceAll('"', '""') + '"'
      ).join(',')
    ).join('\r\n');

    const a = document.createElement('a');
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' })
    );

    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!ready) {
    return <div className="center">
      <section className="card">
        <h1>CLB Karate TH Bình Thuận</h1>
        <h2>Chưa cấu hình Supabase</h2>
        <p>
          Kiểm tra file .env và cấu hình Project URL,
          Publishable key. Không dùng Secret key ở trình duyệt.
        </p>
      </section>
    </div>;
  }

  if (loading) {
    return <div className="center">Đang tải…</div>;
  }

  if (!session) {
    return <div className="center">
      <form className="card login" onSubmit={login}>
        <div className="logo">空</div>
        <h1>CLB Karate TH Bình Thuận</h1>
        <p>Đăng nhập quản trị và huấn luyện viên</p>

        <label>
          Tên đăng nhập
          <input
            autoComplete="username"
            required
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Ví dụ: admin"
          />
        </label>

        <label>
          Mật khẩu
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </label>

        <button className="primary">Đăng nhập</button>

        {err && <p className="error">{err}</p>}
        <small>Tài khoản do quản trị viên cấp.</small>
      </form>
    </div>;
  }

  if (!profile) {
    return <div className="center">
      <section className="card">
        <h2>Tài khoản chưa được phân quyền</h2>
        <p>
          Quản trị viên cần thêm hồ sơ cho tài khoản
          trong bảng profiles.
        </p>
        <button onClick={() => db.auth.signOut()}>
          Đăng xuất
        </button>
        {err && <p className="error">{err}</p>}
      </section>
    </div>;
  }

  return <>
    <header>
      <div className="brand">
        <div className="logo">空</div>
        <div>
          <h1>CLB Karate TH Bình Thuận</h1>
          <small>HỆ THỐNG QUẢN LÝ VÕ SINH & ĐIỂM DANH</small>
        </div>
      </div>

      <div>
        {profile.full_name || session.user.email?.replace('@karate.invalid', '')}
        {' · '}
        {profile.role === 'admin' ? 'Quản trị viên' : 'Huấn luyện viên'}
        {' '}
        <button onClick={() => db.auth.signOut()}>
          Đăng xuất
        </button>
      </div>
    </header>

    <main>
      <div className="top">
        <div>
          <small>BẢNG ĐIỀU KHIỂN</small>
          <h2>
            {tab === 'list'
              ? 'Quản lý hồ sơ võ sinh'
              : tab === 'attendance'
              ? 'Điểm danh buổi tập'
              : 'Quản lý học phí'}
          </h2>
        </div>

        {tab === 'list' &&
          <button
            className="primary"
            onClick={() => {
              setEdit(null);
              setForm(empty);
              setErr('');
              setModal(true);
            }}
          >
            ＋ Thêm võ sinh
          </button>
        }
      </div>

      {err && <p className="error">{err}</p>}

      <div className="stats">
        <div className="card">
          Tổng võ sinh
          <b>{rows.length}</b>
        </div>

        <div className="card">
          Đang tập
          <b>{rows.filter(x => x.status === 'Đang tập').length}</b>
        </div>

        <div className="card">
          Số lớp
          <b>{classes.length}</b>
        </div>

        <div className="card">
          Có mặt ngày này
          <b>{markedValues.filter(x => x === 'Có mặt').length}</b>
        </div>
      </div>

      <nav>
        <button
          className={tab === 'list' ? 'chosen' : ''}
          onClick={() => setTab('list')}
        >
          Quản lý võ sinh
        </button>

        <button
          className={tab === 'attendance' ? 'chosen' : ''}
          onClick={() => setTab('attendance')}
        >
          Điểm danh
        </button>

        <button
          className={tab === 'fees' ? 'chosen' : ''}
          onClick={() => setTab('fees')}
        >
          Học phí
        </button>
      </nav>

      <section className="card">
        {tab !== 'fees' &&
          <div className="filters">
            <input
              placeholder={
                tab === 'list'
                  ? 'Tìm tên, số điện thoại…'
                  : 'Tìm tên võ sinh…'
              }
              value={q}
              onChange={e => setQ(e.target.value)}
            />

            <select value={cls} onChange={e => setCls(e.target.value)}>
              <option value="">Tất cả lớp</option>
              {classes.map(x =>
                <option key={x}>{x}</option>
              )}
            </select>

            {tab === 'list' &&
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Mọi trạng thái tập</option>
                {['Đang tập', 'Bảo lưu', 'Đã nghỉ'].map(x =>
                  <option key={x}>{x}</option>
                )}
              </select>
            }

            {tab === 'attendance' &&
              <label className="date-label">
                Ngày tập
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </label>
            }
          </div>
        }

        {tab === 'list' ? <>
          <p className="section-note">
            Hồ sơ cá nhân, thông tin liên hệ, lớp và cấp đai.
            Võ sinh đã nghỉ tự động được đưa xuống cuối danh sách.
          </p>

          <div className="scroll">
            <table className="management-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Họ và tên</th>
                  <th>Ngày sinh</th>
                  <th>Số điện thoại</th>
                  <th>Lớp</th>
                  <th>Cấp đai</th>
                  <th>Trạng thái tập</th>
                  <th>Thao tác</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((s, i) =>
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td><b>{s.full_name}</b></td>
                    <td>{fmt(s.birth_date)}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.class_name || '—'}</td>
                    <td>
                      <span className={'belt ' + beltClass(s.belt)}>
                        {s.belt}
                      </span>
                    </td>
                    <td>
                      <span className={
                        'status-pill ' +
                        (s.status === 'Đang tập'
                          ? 'active'
                          : s.status === 'Bảo lưu'
                          ? 'paused'
                          : 'stopped')
                      }>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => {
                        setEdit(s.id);
                        setForm({ ...empty, ...s });
                        setErr('');
                        setModal(true);
                      }}>
                        Sửa
                      </button>
                      {' '}
                      <button
                        className="delete"
                        disabled={deletingStudent === s.id || deletingStudent !== null}
                        onClick={() => deleteStudent(s)}
                      >
                        {deletingStudent === s.id ? 'Đang xóa…' : 'Xóa'}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {rowsLoading && <p>Đang tải danh sách…</p>}

            {!filtered.length && !rowsLoading &&
              <p className="empty">Chưa có võ sinh. Nhấn “Thêm võ sinh” để bắt đầu.</p>
            }
          </div>

          <div className="bottom">
            <button onClick={() =>
              exportCSV(
                'Ho_so_vo_sinh.csv',
                ['Họ tên', 'Ngày sinh', 'Điện thoại', 'Lớp', 'Đai', 'Trạng thái'],
                filtered.map(s => [
                  s.full_name, s.birth_date, s.phone,
                  s.class_name, s.belt, s.status
                ])
              )
            }>
              Xuất hồ sơ CSV
            </button>

            <button onClick={() => print()}>In hồ sơ</button>
            <span>{filtered.length}/{rows.length} võ sinh</span>
          </div>

        </> : tab === 'attendance' ? <>
          <p className="section-note">
            Chọn trạng thái cho từng võ sinh trong buổi tập đã chọn.
            Thống kê chuyên cần được tính từ các lần điểm danh đã lưu.
          </p>

          <div className="attendance-summary">
            <div>
              <b>{markedValues.filter(x => x === 'Có mặt').length}</b>
              <span>Có mặt</span>
            </div>

            <div>
              <b>{markedValues.filter(x => x === 'Vắng').length}</b>
              <span>Vắng</span>
            </div>

            <div>
              <b>{markedValues.filter(x => x === 'Có phép').length}</b>
              <span>Có phép</span>
            </div>

            <div>
              <b>{Math.max(0, rows.length - markedValues.length)}</b>
              <span>Chưa điểm danh</span>
            </div>
          </div>

          <div className="scroll">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Họ và tên</th>
                  <th>Lớp</th>
                  <th>Cấp đai</th>
                  <th>Điểm danh buổi này</th>
                  <th>Chuyên cần</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((s, i) => {
                  const h = statFor(s.id);
                  const p = pct(s.id);

                  return <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td><b>{s.full_name}</b></td>
                    <td>{s.class_name || '—'}</td>
                    <td>
                      <span className={'belt ' + beltClass(s.belt)}>
                        {s.belt}
                      </span>
                    </td>
                    <td>
                      <select
                        className={
                          'attendance-select ' +
                          (marks[s.id] === 'Có mặt'
                            ? 'present'
                            : marks[s.id] === 'Vắng'
                            ? 'absent'
                            : marks[s.id] === 'Có phép'
                            ? 'excused'
                            : 'unmarked')
                        }
                        value={marks[s.id] || ''}
                        onChange={e => {
                          if (e.target.value) mark(s.id, e.target.value);
                        }}
                      >
                        <option value="">Chưa điểm danh</option>
                        {['Có mặt', 'Vắng', 'Có phép'].map(x =>
                          <option key={x}>{x}</option>
                        )}
                      </select>
                    </td>
                    <td>
                      <div className="attendance-history">
                        <b>{p}%</b>
                        <span>
                          Có {h.present} · Vắng {h.absent} · Phép {h.excused}
                        </span>
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>

            {rowsLoading && <p>Đang tải điểm danh…</p>}

            {!filtered.length &&
              <p className="empty">Không có võ sinh phù hợp.</p>
            }
          </div>

          <div className="bottom">
            <span>{filtered.length} võ sinh trong danh sách điểm danh</span>
          </div>

        </> : <>
          <div className="filters">
            <label className="date-label">
              Tháng thu học phí
              <input
                type="month"
                value={feeMonth}
                onChange={e => setFeeMonth(e.target.value)}
              />
            </label>

            <button
              className="primary"
              disabled={creatingInvoices || feesLoading || rowsLoading}
              onClick={createInvoices}
            >
              {creatingInvoices ? 'Đang tạo…' : '＋ Tạo học phí tháng này'}
            </button>
          </div>

          <div className="fee-settings">
            <label>
              Mức học phí mỗi tháng (VNĐ)
              <input
                type="number"
                min="1"
                step="1000"
                value={feeRateInput}
                onChange={e => setFeeRateInput(e.target.value)}
              />
            </label>

            <button disabled={savingFee} onClick={saveFeeRate}>
              {savingFee ? 'Đang lưu…' : 'Lưu mức học phí'}
            </button>
          </div>

          <p className="section-note">
            Có thể thu 1, 2 tháng, theo quý (3 tháng) hoặc nhiều tháng cùng lúc.
            Nhập tổng số tiền; hệ thống tự phân bổ lần lượt vào từng tháng.
            Ví dụ 600.000đ = 2 tháng nếu mức thu là 300.000đ/tháng.
            Mức mới chỉ áp dụng cho hóa đơn tạo sau này;
            hóa đơn cũ giữ nguyên.
          </p>

          <div className="attendance-summary">
            <div>
              <b>{feeRows.length}</b>
              <span>Khoản thu</span>
            </div>

            <div>
              <b>{money(feeRows.reduce((n, x) => n + x.paid, 0))}</b>
              <span>Đã thu</span>
            </div>

            <div>
              <b>{money(feeRows.reduce(
                (n, x) => n + Math.max(0, x.amount_due - x.paid), 0
              ))}</b>
              <span>Còn nợ</span>
            </div>

            <div>
              <b>{feeRows.filter(x => x.paid >= x.amount_due).length}</b>
              <span>Đã đóng đủ</span>
            </div>
          </div>

          <div className="scroll">
            <table className="management-table">
              <thead>
                <tr>
                  <th>Võ sinh</th>
                  <th>Lớp</th>
                  <th>Phải đóng</th>
                  <th>Đã đóng</th>
                  <th>Còn nợ</th>
                  <th>Trạng thái</th>
                  <th>Ghi nhận thanh toán</th>
                </tr>
              </thead>

              <tbody>
                {feeRows.map(x => {
                  const left = Math.max(0, x.amount_due - x.paid);

                  return <tr key={x.id}>
                    <td>
                      <b>{x.student?.full_name || 'Võ sinh đã xóa'}</b>

                      {x.payments.length > 0 &&
                        <div className="fee-history">
                          {x.payments.map(p =>
                            <small key={p.id}>
                              {fmt(p.paid_at)} · {money(p.amount)} ·
                              {' '}
                              {p.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                            </small>
                          )}
                        </div>
                      }
                    </td>

                    <td>{x.student?.class_name || '—'}</td>
                    <td>{money(x.amount_due)}</td>
                    <td>{money(x.paid)}</td>
                    <td>{money(left)}</td>

                    <td>
                      <span className={
                        'status-pill ' +
                        (left === 0
                          ? 'active'
                          : x.paid > 0
                          ? 'paused'
                          : 'stopped')
                      }>
                        {left === 0
                          ? 'Đã đóng'
                          : x.paid > 0
                          ? 'Đóng một phần'
                          : 'Chưa đóng'}
                      </span>
                    </td>

                    <td>
                      {left > 0 ?
                        <div className="fee-pay">
                          <input
                            aria-label="Số tiền"
                            type="number"
                            min="1"
                            placeholder="Số tiền (có thể nhiều tháng)"
                            value={payAmounts[x.id] || ''}
                            onChange={e =>
                              setPayAmounts(v => ({ ...v, [x.id]: e.target.value }))
                            }
                          />

                          <select
                            value={payMethods[x.id] || 'cash'}
                            onChange={e =>
                              setPayMethods(v => ({ ...v, [x.id]: e.target.value }))
                            }
                          >
                            <option value="cash">Tiền mặt</option>
                            <option value="transfer">Chuyển khoản</option>
                          </select>

                          <button
                            disabled={paying !== null}
                            onClick={() => addPayment(x)}
                          >
                            {paying === x.id ? 'Đang lưu…' : 'Lưu'}
                          </button>
                        </div>
                        : <span>Hoàn tất</span>
                      }
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>

            {feesLoading && <p>Đang tải học phí…</p>}

            {!feeRows.length && !feesLoading &&
              <p className="empty">
                Chưa có khoản học phí cho tháng này.
                Nhấn “Tạo học phí tháng này”.
              </p>
            }
          </div>

          <div className="bottom">
            <span>{feeRows.length} khoản học phí · {feeMonth}</span>

            <button onClick={() =>
              exportCSV(
                'Hoc_phi_' + feeMonth + '.csv',
                [
                  'Võ sinh', 'Lớp', 'Tháng',
                  'Phải đóng', 'Đã đóng', 'Còn nợ', 'Trạng thái'
                ],
                feeRows.map(x => [
                  x.student?.full_name,
                  x.student?.class_name,
                  feeMonth,
                  x.amount_due,
                  x.paid,
                  Math.max(0, x.amount_due - x.paid),
                  x.paid >= x.amount_due
                    ? 'Đã đóng'
                    : x.paid
                    ? 'Đóng một phần'
                    : 'Chưa đóng'
                ])
              )
            }>
              Xuất học phí CSV
            </button>
          </div>
        </>}
      </section>

      <footer>
        CLB Karate TH Bình Thuận · Dữ liệu lưu trực tuyến
      </footer>
    </main>

    {modal &&
      <div className="overlay">
        <form className="modal card" onSubmit={save}>
          <h2>{edit ? 'Chỉnh sửa hồ sơ võ sinh' : 'Thêm võ sinh'}</h2>

          <div className="grid">
            {[
              ['full_name', 'Họ và tên *', 'text'],
              ['birth_date', 'Ngày sinh', 'date'],
              ['phone', 'Số điện thoại', 'tel'],
              ['class_name', 'Lớp', 'text'],
              ['join_date', 'Ngày nhập học', 'date'],
              ['notes', 'Ghi chú', 'text']
            ].map(([k, label, type]) =>
              <label key={k}>
                {label}
                <input
                  type={type}
                  required={k === 'full_name'}
                  value={form[k] || ''}
                  onChange={e =>
                    setForm(v => ({ ...v, [k]: e.target.value }))
                  }
                />
              </label>
            )}

            <label>
              Cấp đai
              <select
                value={form.belt}
                onChange={e => setForm(v => ({ ...v, belt: e.target.value }))}
              >
                {belts.map(x => <option key={x}>{x}</option>)}
              </select>
            </label>

            <label>
              Trạng thái tập luyện
              <select
                value={form.status}
                onChange={e => setForm(v => ({ ...v, status: e.target.value }))}
              >
                {['Đang tập', 'Bảo lưu', 'Đã nghỉ'].map(x =>
                  <option key={x}>{x}</option>
                )}
              </select>
            </label>
          </div>

          <div className="actions">
            <button type="button" onClick={() => setModal(false)}>
              Hủy
            </button>

            <button className="primary" disabled={savingStudent}>
              {savingStudent ? 'Đang lưu…' : 'Lưu hồ sơ'}
            </button>
          </div>
        </form>
      </div>
    }
  </>;
}
