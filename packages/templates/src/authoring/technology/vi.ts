import type { TechnologyCopies } from './copy';

export const vi: TechnologyCopies = {
  anan: {
    footer: 'Nativ Pay · Đánh giá kiến trúc',
    hero: [
      'Thanh toán tại',
      '3 vùng',
      'Chuyển lõi thanh toán sang ba vùng hoạt động mà không gián đoạn.',
    ],
    section: ['Chỉ một vùng', 'Một sự cố tại đó từng làm dừng mọi khoản thanh toán.'],
    agenda: {
      title: 'Nội dung hôm nay',
      lead: [
        'Vì sao một vùng không còn đủ cho lõi thanh toán của chúng ta.',
        'Cách chuyển sang ba vùng hoạt động mà không ngừng dịch vụ.',
      ],
      points: [
        ['Lý do: ', 'Một sự cố từng làm dừng mọi khoản thanh toán.'],
        ['Kiến trúc: ', 'Mỗi vùng có thể gánh toàn bộ tải.'],
        ['Chuyển đổi: ', 'Bốn giai đoạn trong tháng 12, đều có thể hoàn tác.'],
        ['Kết quả: ', 'Độ sẵn sàng, độ trễ p95 và chi phí tháng.'],
      ],
    },
    figures: {
      title: '90 ngày không ngừng nghỉ',
      subtitle: 'Số phút gián đoạn khi chuyển đổi',
      labels: ['Dịch vụ đã chuyển', 'Thay đổi độ trễ p95', 'Vùng hoạt động đồng thời'],
      body: 'Dưới bảy phút phục vụ hạn chế trong 90 ngày.',
    },
    features: {
      title: 'Ba vùng, một lõi',
      heads: ['Luôn hoạt động', 'Sổ cái đồng bộ', 'Định tuyến theo tình trạng'],
      bodies: [
        'Mỗi vùng xử lý thanh toán thực tế.',
        'Mỗi thanh toán được lưu tại hai vùng trước.',
        'Yêu cầu đến vùng ổn định gần nhất.',
      ],
    },
    timeline: {
      title: 'Bốn giai đoạn, không gián đoạn',
      heads: ['Thử nội bộ', 'Nhóm đầu tiên', 'Nửa lưu lượng', 'Tất cả'],
      bodies: [
        '1/12: nhân viên, tự động quay lại khi lỗi.',
        '8/12: 2.000 đơn vị kinh doanh tình nguyện.',
        '15/12: các vùng mới nhận 50% tải.',
        '22/12: vùng cũ trở thành một trong ba vùng.',
      ],
    },
    process: {
      title: 'Hành trình thanh toán trong 180 ms',
      steps: ['Biên mạng', 'Cân bằng tải', 'Dịch vụ', 'Sổ cái', 'Sao chép'],
    },
    comparison: {
      title: 'Từ một vùng đến ba vùng',
      before: 'Một vùng, dự phòng lạnh',
      after: 'Ba vùng hoạt động',
      old: [
        'Chuyển thủ công trong bốn giờ',
        'Dự phòng chưa từng nhận lưu lượng thật',
        'Một sự cố dừng mọi thanh toán',
      ],
      next: [
        'Vùng lỗi rời tuyến sau 30 giây',
        'Mỗi vùng nhận lưu lượng thật',
        'Sự cố ảnh hưởng tối đa một phần ba',
      ],
    },
    chart: {
      title: 'Độ trễ p95, mili giây',
      note: 'Đo tại biên mạng, tháng 7–12/2026.',
      series: 'p95',
      body: ['Độ trễ giảm 38% nhờ các vùng gần hơn.', 'Chi phí mỗi triệu thanh toán giảm 21%.'],
    },
    table: {
      title: 'Ba vùng qua số liệu',
      note: 'Trung bình 30 ngày, tính đến 10/1/2027.',
      headers: ['Vùng', 'Địa điểm', 'Tỷ lệ tải', 'p95', 'Độ sẵn sàng'],
      labels: ['Tel Aviv', 'Frankfurt', 'Ireland', 'Ba vùng', 'Tổng'],
    },
    photo: [
      'Ba vùng, 42 dịch vụ,',
      'một bản đồ',
      'Mỗi dịch vụ chạy tại mọi vùng. Mỗi vùng có thể gánh toàn bộ tải.',
    ],
    quote: [
      'Đêm chuyển đổi, chúng tôi nhìn biểu đồ và chờ điều gì đó xảy ra. Không có gì cả. Đó chính là mục tiêu.',
      'Kỹ sư SRE trực đêm chuyển đổi',
    ],
    team: {
      title: 'Đội ngũ thực hiện chuyển đổi',
      bios: [
        'Dẫn dắt chuyển đổi sang ba vùng.',
        'Viết hướng dẫn và cơ chế hoàn tác.',
        'Giữ sổ cái luôn đồng bộ.',
        'Xây dựng định tuyến theo tình trạng.',
      ],
      roles: ['Trưởng nền tảng', 'Độ tin cậy', 'Dữ liệu', 'Mạng'],
    },
    closing: {
      title: ['Xin', 'cảm ơn!'],
      lines: [
        'Cẩm nang chuyển đổi mở cho mọi nhóm.',
        'Quý tới: vùng thứ tư tại Bắc Mỹ.',
        'Chúng tôi sẵn sàng cùng xem dữ liệu và giải đáp.',
      ],
    },
  },
  shvav: {
    footer: 'Zrima Labs · WM-10 · Đánh giá EVT',
    hero: [
      'Mười năm,',
      'một viên pin',
      'Đồng hồ nước thông minh WM-10, từ nguyên mẫu đến sản xuất.',
    ],
    section: ['Ngân sách điện năng', 'Mỗi microampe đều quan trọng suốt mười năm.'],
    agenda: {
      title: 'Các câu hỏi cần giải đáp',
      lead: [
        'Bốn đáp án đo được quyết định bước DVT vào tháng 4.',
        'Mỗi câu hỏi có một người phụ trách trong nhóm.',
      ],
      points: [
        ['Điện năng: ', 'Một pin có đủ mười năm, kể cả mùa lạnh?'],
        ['Chi phí: ', 'Giá một bo mạch khi đặt 10.000 chiếc.'],
        ['Thực địa: ', 'Bài học từ 60 đồng hồ chạy từ tháng 1.'],
        ['Sản xuất: ', 'Việc cần xong trước khi đặt lô đầu tiên.'],
      ],
    },
    figures: {
      title: 'Dòng điện đi đâu?',
      subtitle: 'Dòng tiêu thụ trung bình trong một ngày',
      labels: ['Dòng khi ngủ sâu', 'Một pin lithium AA', 'Số năm dùng pin, có dự phòng'],
      body: 'Đo mỗi 15 phút, truyền dữ liệu một lần mỗi ngày.',
    },
    features: {
      title: 'Ba khối, một ngân sách',
      heads: ['Bộ xử lý ngủ sâu', 'Truyền một lần mỗi ngày', 'Đo không tiếp xúc'],
      bodies: [
        'Thức 40 ms, đo rồi ngủ tiếp.',
        'Một tin mỗi ngày, phát trong 1,2 giây.',
        'Siêu âm, không có bộ phận bị mài mòn.',
      ],
    },
    timeline: {
      title: 'Từ EVT đến sản xuất hàng loạt',
      heads: ['Mẫu kỹ thuật', 'Xác nhận thiết kế', 'Xác nhận sản xuất', 'Sản xuất hàng loạt'],
      bodies: [
        'Tháng 1/2027: 60 đồng hồ ngoài thực địa.',
        'Tháng 4/2027: 200 máy thử độ bền.',
        'Tháng 6/2027: 1.000 máy ra dây chuyền.',
        'Tháng 9/2027: 10.000 máy mỗi quý.',
      ],
    },
    process: {
      title: 'Từ nước lên đám mây',
      steps: ['Cảm biến', 'Khuếch đại / ADC', 'Bộ xử lý', 'Vô tuyến', 'Đám mây'],
    },
    comparison: {
      title: 'Phiên bản B và phiên bản C',
      before: 'B · nguyên mẫu',
      after: 'C · bo mạch EVT',
      old: ['Sáu lớp, 52 linh kiện', 'Chip NB-IoT riêng', 'Pin dùng 4,1 năm'],
      next: ['Bốn lớp, 38 linh kiện', 'LoRa tích hợp trong bộ xử lý', 'Pin dùng 10,8 năm'],
    },
    chart: {
      title: 'Một lần phát trên máy hiện sóng',
      note: 'Mẫu thử 17, tháng 3/2027. Dòng điện: mA.',
      series: 'mA',
      body: ['Phát 1,2 giây, một lần mỗi ngày.', '99,3% số đo thử nghiệm đến được đám mây.'],
    },
    table: {
      title: 'Chi phí một bo mạch',
      note: 'Báo giá tháng 3/2027 cho 10.000 chiếc.',
      headers: ['Mã', 'Linh kiện', 'SL', 'Đơn giá', 'Thành tiền'],
      labels: [
        'Bộ xử lý có LoRa',
        'Mạch đầu vào siêu âm',
        'Pin lithium AA',
        'Bo mạch bốn lớp',
        'Linh kiện thụ động',
        'Tổng mỗi bo mạch',
      ],
    },
    photo: [
      'Kiểm tra từng bo',
      'trước khi niêm kín',
      'Tám bo mạch hoàn tất kiểm tra dòng, vô tuyến và cảm biến trong 40 giây.',
    ],
    quote: [
      'Chúng tôi chọn những hố đồng hồ ẩm nhất. Hai tháng sau, tất cả vẫn gửi báo cáo mỗi sáng.',
      'Trưởng vận hành công ty cấp nước tham gia thử nghiệm',
    ],
    team: {
      title: 'Đội ngũ thiết kế bo mạch',
      bios: [
        'Đưa bản C từ sơ đồ đến EVT.',
        'Tinh chỉnh anten dưới nước.',
        'Viết phần mềm ngủ 99,9% thời gian.',
        'Xây dựng trạm kiểm tra sản xuất.',
      ],
      roles: ['Trưởng phần cứng', 'Vô tuyến và anten', 'Phần mềm nhúng', 'Sản xuất'],
    },
    closing: {
      title: ['Sẵn sàng', 'sản xuất'],
      lines: [
        '200 máy DVT lên dây chuyền vào tháng 4.',
        'Tìm thêm hai đơn vị cấp nước để thử nghiệm.',
        'Mời xem bo mạch và đặt câu hỏi.',
      ],
    },
  },
  mutzar: {
    footer: 'Zrima 2.0 · Đêm ra mắt',
    hero: ['Vận hành ở chế độ', 'tự động', 'Zrima 2.0 kết nối công cụ và xử lý công việc lặp lại.'],
    section: ['Điểm mới', 'Ba điều bạn yêu cầu và một bất ngờ.'],
    agenda: {
      title: 'Chương trình tối nay',
      lead: [
        'Ba mươi phút về những điểm mới của Zrima 2.0 và lý do thiết kế.',
        'Sau đó trình diễn: từ trang trắng đến một quy trình tự chạy.',
      ],
      points: [
        ['Trình tạo: ', 'Mọi bước trên một khung, AI phác thảo giúp.'],
        ['Bản beta: ', 'Sản phẩm và yêu cầu của 4.200 nhóm.'],
        ['Các gói: ', 'Ba lựa chọn, từ miễn phí đến Business.'],
        ['Lộ trình: ', 'Duyệt trên điện thoại tháng 2, chia sẻ quy trình năm 2027.'],
      ],
    },
    figures: {
      title: 'Bản beta qua số liệu',
      subtitle: 'Quy trình chạy tự động trong giai đoạn beta',
      labels: ['Nhóm trong beta mở', 'Giảm thời gian xử lý đơn', 'Độ sẵn sàng trong ba tháng'],
      body: 'Mỗi nhóm tạo trung bình 14 quy trình trong tuần đầu.',
    },
    features: {
      title: 'Ba khả năng mới',
      heads: ['Tác nhân AI', '400 tích hợp', 'Quyền theo từng bước'],
      bodies: [
        'Phân loại, trả lời hoặc chuyển yêu cầu cho người phụ trách.',
        'Từ tài chính đến kho: kết nối trong hai phút.',
        'Quyền tối thiểu mỗi bước, mọi thao tác có nhật ký.',
      ],
    },
    timeline: {
      title: 'Từ phiên bản 1.0 đến 3.0',
      heads: ['Nền tảng', 'Trình tạo và AI', 'Ứng dụng di động', 'Quy trình chung'],
      bodies: [
        '2025: 40 tích hợp, quy trình đơn giản.',
        'Tháng 12/2026: trình tạo, AI, 400 tích hợp.',
        'Tháng 2/2027: duyệt và thông báo di động.',
        'Cuối 2027: khách hàng, nhà cung cấp cùng quy trình.',
      ],
    },
    process: {
      title: 'Quy trình đầu tiên trong 15 phút',
      steps: ['Đăng ký', 'Kết nối', 'Mời nhóm', 'Tự động hóa', 'Báo cáo'],
    },
    comparison: {
      title: 'Một đơn hàng, hai cách làm',
      before: 'Sáu công cụ, 40 phút',
      after: 'Một quy trình, 4 phút',
      old: [
        'Chép dữ liệu thủ công giữa các công cụ',
        'Gọi điện để xin phê duyệt',
        'Đến cuối tháng mới tìm ra lỗi',
      ],
      next: [
        'Dữ liệu tự động luân chuyển',
        'Duyệt ngay từ thông báo',
        'Phát hiện ngoại lệ ngay khi xảy ra',
      ],
    },
    chart: {
      title: 'Các nhóm đến và ở lại',
      note: 'Dữ liệu sử dụng tháng 6–11/2026.',
      series: 'Quy trình',
      body: ['Quy trình hoạt động tăng 13 lần từ tháng 6.', '92% nhóm vẫn hoạt động sau 60 ngày.'],
    },
    table: {
      title: 'Ba gói, một sản phẩm',
      note: 'Giá ra mắt khi đăng ký đến ngày 31/1/2027.',
      headers: ['Bao gồm', 'Free', 'Pro', 'Business'],
      labels: [
        'Quy trình hoạt động',
        'Lượt chạy mỗi tháng',
        'Tác nhân AI',
        'Phân quyền và SSO',
        'Giá / người / tháng',
        'Miễn phí',
        'Không giới hạn',
        'Cơ bản',
        'Đầy đủ',
      ],
    },
    photo: [
      'Một bảng chung cho',
      'toàn bộ vận hành',
      'Đơn hàng, tồn kho, nhà cung cấp và yêu cầu theo thời gian thực trên một màn hình chung.',
    ],
    quote: [
      'Trước đây mỗi đơn phải chép vào sáu hệ thống. Giờ nhóm tôi chỉ xử lý ngoại lệ, phần còn lại tự vận hành.',
      'Trưởng vận hành chuỗi bán lẻ thể thao · khách hàng beta',
    ],
    team: {
      title: 'Đội ngũ xây dựng Zrima',
      bios: [
        'Điều hành tại ba công ty logistics.',
        'Xây dựng bộ máy chạy hai triệu lượt mỗi ngày.',
        'Phụ trách trình tạo và tác nhân AI.',
        'Thiết kế 2.0 cùng bốn mươi nhóm vận hành.',
      ],
      roles: ['Tổng giám đốc', 'Giám đốc công nghệ', 'Trưởng sản phẩm', 'Trưởng thiết kế'],
    },
    closing: {
      title: ['Bắt đầu', 'vận hành'],
      lines: [
        'Mở tài khoản miễn phí tại zrima.example.',
        'Trình diễn tại gian hàng đến 22 giờ.',
        'Giảm 30% đến hết tháng 1.',
      ],
    },
  },
};
