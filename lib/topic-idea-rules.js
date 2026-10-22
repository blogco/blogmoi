// Editorial angles, selected deterministically at build time. No API or AI call.
export const topicIdeaRules = [
  {
    id: "sync", terms: ["indexeddb", "sync", "dong bo", "scopeLabel", "hang cho"],
    ideas: [
      ["Kiểm thử lỗi giữa chừng trong một lần đồng bộ GitHub", "Thiết kế các ca mất phản hồi PUT, lỗi metadata và reload để kiểm tra khả năng phục hồi.", "Mở rộng câu chuyện đồng bộ sang cách chủ động tái hiện những lỗi khó gặp."],
      ["Hai thiết bị cùng sửa một giao dịch: thiết kế màn hình giải quyết xung đột", "Dùng ba phiên bản baseline, local và cloud để trình bày lựa chọn và giữ lịch sử quyết định.", "Đi sâu vào trường hợp hai bản chỉnh sửa cần người dùng quyết định thay vì tự ghi đè."],
      ["Thiết kế quyền tối thiểu cho GitHub Token trong ứng dụng cá nhân", "Lập bảng thao tác đọc/ghi, quyền cần thiết, cách thu hồi token và kịch bản kiểm thử không ghi dữ liệu thật.", "Tách quyền truy cập GitHub khỏi kết quả đồng bộ dữ liệu."],
      ["Sao lưu IndexedDB mà vẫn giữ được hàng chờ và dấu xóa", "Đề xuất định dạng bản sao lưu, cách xem trước và bộ kiểm thử khôi phục trên dữ liệu giả lập.", "Tiếp nối yêu cầu bảo toàn giao dịch khi thiết bị hoặc quy trình đồng bộ gặp sự cố."],
    ],
  },
  {
    id: "font", terms: ["font", "typography", "woff2", "unicode range", "be vietnam pro"],
    ideas: [
      ["Tạo bộ câu tiếng Việt để kiểm thử font tự host", "Xây dựng mẫu kiểm tra dấu kết hợp, chữ hoa, số và các chuỗi dễ lộ lỗi fallback.", "Biến quyết định typography thành các trường hợp có thể kiểm tra lại."],
      ["Đo font swap trên mạng chậm bằng một trang thử nghiệm nhỏ", "So sánh thời điểm tải font, thay đổi dòng chữ và layout shift với điều kiện đo được ghi rõ.", "Bổ sung một phép đo cụ thể cho trải nghiệm khi font chưa tải xong."],
      ["Ngân sách font cho một blog đa ngôn ngữ", "Lập kế hoạch subset, fallback và dung lượng tải cho tiếng Việt, Latin và chữ Hàn.", "Mở rộng lựa chọn font hiện tại sang tình huống nhiều hệ chữ."],
      ["Kiểm tra giấy phép và phiên bản font trong quy trình build", "Thiết kế danh mục file font, license và kiểm tra tự động để tránh thất lạc thông tin khi cập nhật.", "Theo dõi khía cạnh bảo trì của tài nguyên typography tự host."],
    ],
  },
  {
    id: "benchmark", terms: ["benchmark", "phep do", "do thoi gian", "hieu nang build"],
    ideas: [
      ["Đo cold build và warm build: tách cache khỏi kết quả benchmark", "Thiết kế hai lượt đo riêng, công khai trạng thái cache và cách chuẩn bị môi trường.", "Đào sâu một biến có thể làm sai cách diễn giải thời gian build."],
      ["Tạo bộ dữ liệu benchmark từ 10 đến 10.000 bài Markdown", "Xây dựng fixture có kích thước, ảnh và taxonomy kiểm soát được để khảo sát khả năng mở rộng.", "Tiếp nối phép đo cùng nội dung bằng việc thay đổi quy mô có chủ đích."],
      ["Vì sao benchmark trên CI và máy cá nhân có thể khác nhau?", "Lập thí nghiệm lặp lại và ghi nhận CPU, tải nền, cache cùng độ phân tán của kết quả.", "Bổ sung cách đọc kết quả khi môi trường chạy thay đổi."],
      ["Theo dõi hồi quy thời gian build qua từng commit", "Thiết kế báo cáo trung vị, ngưỡng cảnh báo và liên kết tới thay đổi cần điều tra.", "Biến một phép đo riêng lẻ thành công cụ theo dõi dự án lâu dài."],
    ],
  },
  {
    id: "migration", terms: ["migration", "chuyen blog", "giu url", "permalink", "redirect"],
    ideas: [
      ["Viết công cụ đối chiếu sitemap trước và sau khi chuyển blog", "Xuất danh sách URL thiếu, URL mới và canonical khác nhau để rà soát trước khi triển khai.", "Chuyển yêu cầu giữ đường dẫn thành kiểm tra tự động."],
      ["Diễn tập rollback cho một blog tĩnh trên GitHub Pages", "Xây dựng kịch bản thử bằng fixture và xác định artifact, commit, URL cần đối chiếu khi quay lại.", "Mở rộng kế hoạch chuyển đổi sang cách phục hồi khi bản phát hành có vấn đề."],
      ["Giữ đường dẫn ảnh khi đổi cấu trúc thư mục bài viết", "Thiết kế bảng ánh xạ tài nguyên và bộ kiểm tra liên kết tương đối trong Markdown.", "Theo dõi phần tài nguyên dễ bị bỏ sót khi chỉ kiểm kê URL trang."],
      ["Chuyển blog đa ngôn ngữ: kiểm kê slug và canonical theo từng ngôn ngữ", "Lập fixture có nhiều hệ chữ để kiểm tra permalink, liên kết nội bộ và metadata ngôn ngữ.", "Đưa quy trình bảo toàn URL sang tình huống phức tạp hơn."],
    ],
  },
  {
    id: "discovery", terms: ["topic discovery", "taxonomy", "phan loai", "goi y", "kham pha theo chu de"],
    ideas: [
      ["Đánh giá độ hữu ích của gợi ý chủ đề bằng một bộ bài mẫu", "Xây dựng tiêu chí liên quan, khác biệt và khả năng phát triển thành bài mới; đánh giá thủ công trước khi đổi quy tắc.", "Bổ sung cách kiểm chứng chất lượng thay vì chỉ đếm số gợi ý."],
      ["Vòng đời một ý tưởng: từ backlog tới bài đã xuất bản", "Thiết kế quy tắc duyệt, từ chối, phát hiện bài đích và giữ dấu vết biên tập.", "Đi sâu vào việc duy trì danh sách ý tưởng khi thư viện bài viết lớn dần."],
      ["Kiểm thử taxonomy khi bài viết thiếu tag hoặc đổi chuyên mục", "Tạo fixture metadata thiếu và thay đổi nhãn để kiểm tra những đường dẫn suy giảm chất lượng.", "Mở rộng cơ chế phân loại sang các ca biên trong nội dung thực tế."],
      ["Tránh gợi ý vòng lặp và chủ đề đã viết trong một blog nhỏ", "Thiết kế bộ so sánh tiêu đề, trạng thái backlog và quy trình rà soát các góc khai thác quá gần nhau.", "Tập trung vào sự khác biệt giữa ý tưởng tương lai và liên kết tới bài cũ."],
    ],
  },
  {
    id: "workflow", terms: ["codex", "terminal", "report", "bao cao", "kiem thu"],
    ideas: [
      ["Một báo cáo phát hành cần những bằng chứng nào?", "Ánh xạ từng trạng thái build, test và deploy tới log hoặc artifact có thể đối chiếu.", "Phát triển yêu cầu minh bạch thành tiêu chí kiểm tra được."],
      ["Tách thay đổi nội dung và thay đổi tính năng bằng Git worktree", "Minh họa một phiên làm việc có các thay đổi chưa commit bằng repository thử nghiệm.", "Mở rộng quy trình làm việc sang cách giữ các tác vụ độc lập."],
      ["Thiết kế quality gate cho bài viết Markdown trước khi push", "Kết hợp kiểm tra front matter, đường dẫn và output mà không làm thay đổi nội dung đã xuất bản.", "Áp dụng tư duy kiểm chứng vào việc xuất bản bài blog."],
      ["Khi nào một tác vụ nên được báo PARTIAL?", "Xây dựng các tình huống đã build nhưng chưa kiểm tra browser hoặc chưa đối chiếu production, cùng bằng chứng cần bổ sung.", "Làm rõ giới hạn của một báo cáo hoàn thành thay vì chỉ thay nhãn trạng thái."],
    ],
  },
  {
    id: "ssg", terms: ["eleventy", "hugo", "astro", "ssg", "website tinh", "blog tinh"],
    ideas: [
      ["Cache trong Eleventy: phần nào nên tính lại khi nội dung thay đổi?", "Lập thí nghiệm với collection, dữ liệu dùng chung và template để theo dõi phạm vi rebuild.", "Đi sâu vào cách tổ chức build của một blog tĩnh."],
      ["Quản lý ảnh cho blog tĩnh: kích thước, biến thể và ngân sách tải", "Thiết kế pipeline ảnh bằng fixture và kiểm tra output trước khi áp dụng cho nội dung thật.", "Bổ sung góc tài nguyên ảnh bên cạnh lựa chọn công cụ tạo trang."],
      ["Kiểm tra liên kết nội bộ khi website chạy dưới path prefix", "Tạo fixture trang chủ, bài viết và taxonomy để phát hiện đường dẫn bỏ sót tiền tố.", "Tiếp nối kiến trúc website tĩnh bằng một nguồn lỗi triển khai cụ thể."],
      ["Tách dữ liệu nội dung khỏi template khi blog ngày càng lớn", "So sánh các cách tổ chức front matter, dữ liệu dùng chung và component với một bộ bài mẫu.", "Mở rộng quyết định công nghệ sang vấn đề bảo trì lâu dài."],
    ],
  },
];
